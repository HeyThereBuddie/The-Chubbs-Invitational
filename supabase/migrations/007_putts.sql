-- Add putts tracking column to scores
ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS putts smallint CHECK (putts BETWEEN 1 AND 5);
