-- Allow 0 putts (chip-ins, etc.)
ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_putts_check;
ALTER TABLE public.scores ADD CONSTRAINT scores_putts_check CHECK (putts BETWEEN 0 AND 5);
