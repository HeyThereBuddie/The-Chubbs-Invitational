-- Add drive tracking column to scores
ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS drive_used_id uuid REFERENCES public.profiles(id);
