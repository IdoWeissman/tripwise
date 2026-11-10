import { describe, expect, it } from 'vitest';
import { splitText } from '../src/assistant/chunks.js';
import { toVector, voyageEmbedder } from '../src/assistant/embeddings.js';
import { fuse } from '../src/assistant/search.js';

const row = (key: string) => ({
  key,
  kind: 'BOOKING' as const,
  sourceId: key,
  title: key,
  content: '',
});

describe('hybrid search fusion (RRF)', () => {
  it('ranks results found by both searches first', () => {
    const hits = fuse([
      { via: 'semantic', rows: [row('a'), row('b'), row('c')] },
      { via: 'keyword', rows: [row('c'), row('d')] },
    ]);
    expect(hits[0]!.key).toBe('c');
    expect(hits[0]!.via).toEqual(['semantic', 'keyword']);
    // b and d tie (both 2nd in one list); ties keep first-seen order.
    expect(hits.map((h) => h.key)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('works with keyword search alone', () => {
    expect(fuse([{ via: 'keyword', rows: [row('x')] }]).map((h) => h.key)).toEqual(['x']);
  });
});

describe('document splitting', () => {
  it('keeps short documents whole and splits long ones with overlap', () => {
    expect(splitText('  Short note.  ')).toEqual(['Short note.']);
    const para = 'Sentence about the trip. '.repeat(40);
    const parts = splitText(`${para}\n\n${para}\n\n${para}`, 1500, 200);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1500)).toBe(true);
    expect(parts[1]!.slice(0, 50)).toBe(parts[0]!.slice(-200).trim().slice(0, 50));
  });
});

describe('Voyage embedder', () => {
  it('sends the right request and keeps input order', async () => {
    let sent: Record<string, unknown> = {};
    const embedder = voyageEmbedder({
      apiKey: 'k',
      model: 'voyage-4-lite',
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return Response.json({
          data: [
            { index: 1, embedding: new Array(1024).fill(2) },
            { index: 0, embedding: new Array(1024).fill(1) },
          ],
        });
      },
    });
    const [first, second] = await embedder.embed(['a', 'b'], 'document');
    expect(sent).toMatchObject({
      input: ['a', 'b'],
      model: 'voyage-4-lite',
      input_type: 'document',
      output_dimension: 1024,
    });
    expect(first![0]).toBe(1);
    expect(second![0]).toBe(2);
    expect(toVector([1, 0.5])).toBe('[1,0.5]');
  });
});
