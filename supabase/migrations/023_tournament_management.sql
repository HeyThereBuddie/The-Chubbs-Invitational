-- ============================================================
-- Tournament Year Management
-- ============================================================

-- Full standings snapshot saved on archive
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS final_standings jsonb;

-- Soft-delete support (hides year from Hall of Fame, restoreable)
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Optional notes field for the year
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS notes text;
