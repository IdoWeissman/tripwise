-- Onboarding checklist. Additive only: two nullable columns on the member row.
-- inviteSharedAt: when this member first created an invite link (links are stateless tokens).
-- setupHiddenAt: when this member hid the trip's "Get the trip ready" checklist.
ALTER TABLE "TripMember" ADD COLUMN "inviteSharedAt" TIMESTAMP(3);
ALTER TABLE "TripMember" ADD COLUMN "setupHiddenAt" TIMESTAMP(3);
