-- ============================================================
-- Per-Tournament Data Association
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- Add tournament_id to teams
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id);

-- Backfill teams with the active tournament
UPDATE public.teams
SET tournament_id = t.id
FROM public.tournaments t
WHERE t.status = 'active'
  AND public.teams.tournament_id IS NULL;

-- Add tournament_id to contest_entries
ALTER TABLE public.contest_entries ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id);

-- Backfill contest_entries
UPDATE public.contest_entries
SET tournament_id = t.id
FROM public.tournaments t
WHERE t.status = 'active'
  AND public.contest_entries.tournament_id IS NULL;

-- Add tournament_id to leahey_votes
ALTER TABLE public.leahey_votes ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id);

-- Backfill leahey_votes
UPDATE public.leahey_votes
SET tournament_id = t.id
FROM public.tournaments t
WHERE t.status = 'active'
  AND public.leahey_votes.tournament_id IS NULL;

-- Add tournament_id to feed_events
ALTER TABLE public.feed_events ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id);

-- Backfill feed_events
UPDATE public.feed_events
SET tournament_id = t.id
FROM public.tournaments t
WHERE t.status = 'active'
  AND public.feed_events.tournament_id IS NULL;
