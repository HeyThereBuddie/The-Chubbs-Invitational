-- Per-player club carry distances ("My Bag") for GPS club recommendations.
-- Stored as a JSONB array of { club, carry, enabled }; null falls back to the
-- app's default bag. Nullable + backward-compatible with existing profiles.
alter table profiles add column if not exists club_distances jsonb;
