-- The setup checklist is first-run only: trips that existed before it shipped never show it.
UPDATE "TripMember" SET "setupHiddenAt" = NOW() WHERE "setupHiddenAt" IS NULL;
