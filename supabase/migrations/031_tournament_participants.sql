-- Snapshot of active (non-admin) players at the time a tournament is archived.
-- Used by the RSVP panel to show "↩ Returning" badges the following year.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS participants_json jsonb;
