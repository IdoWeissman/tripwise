-- Day planner (planning milestone 2). Additive only: two enums, two columns with defaults, one nullable column.
CREATE TYPE "Pace" AS ENUM ('RELAXED', 'BALANCED', 'PACKED');
CREATE TYPE "GetAround" AS ENUM ('WALK_TRANSIT', 'DRIVE');

ALTER TABLE "Trip" ADD COLUMN "pace" "Pace" NOT NULL DEFAULT 'BALANCED';
ALTER TABLE "Trip" ADD COLUMN "getAround" "GetAround" NOT NULL DEFAULT 'WALK_TRANSIT';

ALTER TABLE "Activity" ADD COLUMN "durationMinutes" INTEGER;
