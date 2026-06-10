-- Drop the unique constraint on tournaments.year so multiple tournaments
-- can share a calendar year (distinguished by name instead).
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_year_key;
