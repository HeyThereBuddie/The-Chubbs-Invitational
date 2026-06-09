CREATE TABLE IF NOT EXISTS public.highlights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  type        text NOT NULL CHECK (type IN ('eagle','ace','birdie','disaster','moment')),
  player_name text NOT NULL,
  hole        smallint CHECK (hole BETWEEN 1 AND 18),
  description text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read highlights"
  ON public.highlights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins insert highlights"
  ON public.highlights FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins delete highlights"
  ON public.highlights FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
