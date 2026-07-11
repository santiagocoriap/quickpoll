-- Per-group voting overrides for a runoff phase (weight, eligibility,
-- selection limits), stored as a JSON array. Nullable so existing runoffs keep
-- their legacy behaviour (inherit weight/eligibility, uniform limits).
ALTER TABLE "PollPhase" ADD COLUMN "groupLimits" JSONB;
