-- Auto-refresh updated_at on scores so the live feed stabilization works correctly
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scores_set_updated_at ON public.scores;
CREATE TRIGGER scores_set_updated_at
  BEFORE UPDATE ON public.scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
