/** Text embeddings for trip search. Voyage AI (Anthropic's recommended embeddings provider). */

export const EMBEDDING_DIMS = 1024;

export interface Embedder {
  /** Stored with each chunk's hash, so changing models re-embeds everything once. */
  model: string;
  embed(texts: string[], kind: 'query' | 'document'): Promise<number[][]>;
}

const BATCH = 128;

export function voyageEmbedder(opts: {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}): Embedder {
  const doFetch = opts.fetch ?? fetch;
  return {
    model: opts.model,
    async embed(texts, kind) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const res = await doFetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({
            input: texts.slice(i, i + BATCH),
            model: opts.model,
            input_type: kind,
            output_dimension: EMBEDDING_DIMS,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
        const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
        const batch = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
        if (batch.some((v) => v.length !== EMBEDDING_DIMS))
          throw new Error('Voyage returned an unexpected embedding size');
        out.push(...batch);
      }
      return out;
    },
  };
}

/** pgvector literal: "[0.1,0.2,…]". */
export const toVector = (v: number[]) => `[${v.join(',')}]`;
