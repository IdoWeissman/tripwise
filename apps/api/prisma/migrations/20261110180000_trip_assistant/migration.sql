-- Trip assistant (RAG). Additive only: an extension, two new tables and one nullable column.
-- pgvector ships with Neon; locally use the pgvector/pgvector Postgres image (docker-compose.yml).
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Attachment" ADD COLUMN "extractedText" TEXT;

CREATE TABLE "TripChunk" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "embedding" vector(1024),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripChunk_tripId_key_key" ON "TripChunk"("tripId", "key");
ALTER TABLE "TripChunk" ADD CONSTRAINT "TripChunk_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nearest-neighbour search by cosine distance.
CREATE INDEX "TripChunk_embedding_idx" ON "TripChunk" USING hnsw ("embedding" vector_cosine_ops);
-- Keyword search with English stemming ("staying" finds "stay"); other scripts, like Hebrew, are kept as-is.
CREATE INDEX "TripChunk_fts_idx" ON "TripChunk" USING gin (to_tsvector('english', "title" || ' ' || "content"));

CREATE TABLE "AssistantUsage" (
    "day" DATE NOT NULL,
    "userId" UUID NOT NULL,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("day","userId")
);

ALTER TABLE "AssistantUsage" ADD CONSTRAINT "AssistantUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
