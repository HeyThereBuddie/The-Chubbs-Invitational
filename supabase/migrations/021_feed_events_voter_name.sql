-- Add a dedicated voter_name column so jackass votes are fully individual (no team logic)
ALTER TABLE public.feed_events ADD COLUMN IF NOT EXISTS voter_name text;

-- Clear stale jackass vote entries that were logged with team names before this fix
DELETE FROM public.feed_events WHERE event_type = 'contest' AND label IN ('Jackass Vote', 'Vote Changed');
