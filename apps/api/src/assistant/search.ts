import { createHash } from 'node:crypto';
import type { Db } from '../db.js';
import { buildChunks, type Chunk } from './chunks.js';
import { toVector, type Embedder } from './embeddings.js';

export interface SearchHit {
  key: string;
  kind: Chunk['kind'];
  sourceId: string | null;
  title: string;
  content: string;
  /** Fused score (higher is better) and which searches found it, for debugging and evals. */
  score: number;
  via: ('semantic' | 'keyword')[];
}

const hashOf = (c: Chunk, model: string) =>
  createHash('sha256').update(`${model}\n${c.title}\n${c.content}`).digest('hex');

/** One sync per trip at a time; concurrent questions wait for the same run. */
const running = new Map<string, Promise<SyncResult>>();

export interface SyncResult {
  total: number;
  embedded: number;
  removed: number;
}

/**
 * Brings a trip's chunks up to date. Cheap when nothing changed (one read + hash compare);
 * only new or edited chunks are embedded. Runs before every question, so the index is never stale.
 */
export function syncTrip(db: Db, tripId: string, embedder: Embedder | null): Promise<SyncResult> {
  const pending = running.get(tripId);
  if (pending) return pending;
  const run = doSync(db, tripId, embedder).finally(() => running.delete(tripId));
  running.set(tripId, run);
  return run;
}

async function doSync(db: Db, tripId: string, embedder: Embedder | null): Promise<SyncResult> {
  const model = embedder?.model ?? 'keyword-only';
  const chunks = await buildChunks(db, tripId);
  const existing = await db.$queryRaw<{ key: string; hash: string; embedded: boolean }[]>`
    SELECT "key", "hash", "embedding" IS NOT NULL AS embedded FROM "TripChunk" WHERE "tripId" = ${tripId}::uuid`;
  const byKey = new Map(existing.map((r) => [r.key, r]));

  const changed = chunks.filter((c) => {
    const row = byKey.get(c.key);
    // Re-embed when the text changed, or when a vector is missing now that an embedder exists.
    return !row || row.hash !== hashOf(c, model) || (embedder !== null && !row.embedded);
  });
  const vectors =
    embedder && changed.length ? await embedder.embed(changed.map(text), 'document') : [];

  await db.$transaction(async (tx) => {
    for (const [i, c] of changed.entries()) {
      const vector = vectors[i] ? toVector(vectors[i]) : null;
      await tx.$executeRaw`
        INSERT INTO "TripChunk" ("id", "tripId", "key", "kind", "sourceId", "title", "content", "hash", "embedding", "updatedAt")
        VALUES (gen_random_uuid(), ${tripId}::uuid, ${c.key}, ${c.kind}, ${c.sourceId}, ${c.title}, ${c.content}, ${hashOf(c, model)}, ${vector}::vector, now())
        ON CONFLICT ("tripId", "key") DO UPDATE SET
          "kind" = EXCLUDED."kind", "sourceId" = EXCLUDED."sourceId", "title" = EXCLUDED."title",
          "content" = EXCLUDED."content", "hash" = EXCLUDED."hash", "embedding" = EXCLUDED."embedding", "updatedAt" = now()`;
    }
  });

  const keep = new Set(chunks.map((c) => c.key));
  const stale = existing.filter((r) => !keep.has(r.key)).map((r) => r.key);
  if (stale.length)
    await db.$executeRaw`DELETE FROM "TripChunk" WHERE "tripId" = ${tripId}::uuid AND "key" = ANY(${stale})`;
  return { total: chunks.length, embedded: vectors.length, removed: stale.length };
}

/** What gets embedded: the title gives short chunks their context. */
const text = (c: Pick<Chunk, 'title' | 'content'>) => `${c.title}\n${c.content}`;

interface Row {
  key: string;
  kind: Chunk['kind'];
  sourceId: string | null;
  title: string;
  content: string;
}

/** Words too common to help keyword search (semantic search handles phrasing). */
const STOPWORDS = new Set(
  'a an and are at be can do does for from how i in is it me my of on or our so that the this to us was we what when where which who why will with you your'.split(
    ' ',
  ),
);

/** Reciprocal rank fusion: robust to the two searches scoring on different scales. */
export function fuse(lists: { via: SearchHit['via'][number]; rows: Row[] }[], k = 60): SearchHit[] {
  const hits = new Map<string, SearchHit>();
  for (const { via, rows } of lists) {
    rows.forEach((row, rank) => {
      const hit = hits.get(row.key) ?? { ...row, score: 0, via: [] };
      hit.score += 1 / (k + rank + 1);
      hit.via.push(via);
      hits.set(row.key, hit);
    });
  }
  return [...hits.values()].sort((a, b) => b.score - a.score);
}

/**
 * Hybrid search over one trip: pgvector cosine similarity (when an embedder is configured)
 * and Postgres full-text search, fused with RRF. Keyword search catches exact codes and names
 * ("TP 1394", "Casa Inventada"); semantic search catches meaning ("where do we sleep?").
 */
export async function searchTrip(
  db: Db,
  tripId: string,
  query: string,
  embedder: Embedder | null,
  limit = 6,
  /** Evals compare the searches on their own; the app always uses both. */
  mode: 'hybrid' | 'semantic' | 'keyword' = 'hybrid',
): Promise<SearchHit[]> {
  const pool = 20;
  const lists: { via: SearchHit['via'][number]; rows: Row[] }[] = [];

  if (embedder && mode !== 'keyword') {
    const [q] = await embedder.embed([query], 'query');
    const rows = await db.$queryRaw<Row[]>`
      SELECT "key", "kind", "sourceId", "title", "content" FROM "TripChunk"
      WHERE "tripId" = ${tripId}::uuid AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${toVector(q!)}::vector, "title", "key" LIMIT ${pool}`;
    lists.push({ via: 'semantic', rows });
  }

  // OR the query's words, so partial matches still rank (plain/websearch syntax would AND them).
  const words = query
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .slice(0, 16);
  if (words?.length && mode !== 'semantic') {
    const tsquery = words.map((w) => `${w}:*`).join(' | ');
    const rows = await db.$queryRaw<Row[]>`
      SELECT "key", "kind", "sourceId", "title", "content" FROM "TripChunk"
      WHERE "tripId" = ${tripId}::uuid
        AND to_tsvector('english', "title" || ' ' || "content") @@ to_tsquery('english', ${tsquery})
      ORDER BY ts_rank(to_tsvector('english', "title" || ' ' || "content"), to_tsquery('english', ${tsquery})) DESC, "title", "key"
      LIMIT ${pool}`;
    lists.push({ via: 'keyword', rows });
  }
  return fuse(lists).slice(0, limit);
}
