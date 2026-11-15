-- Password reset (ADR 0001): sessions issued before this moment are no longer accepted.
-- Additive and nullable: existing accounts keep every session until they change their password.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
