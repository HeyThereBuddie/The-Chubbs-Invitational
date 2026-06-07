-- Singleton settings row for tournament state
CREATE TABLE IF NOT EXISTS public.tournament_settings (
  id integer PRIMARY KEY DEFAULT 1,
  lahey_voting_open boolean NOT NULL DEFAULT false,
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO public.tournament_settings (id, lahey_voting_open)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tournament_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
  ON public.tournament_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update settings"
  ON public.tournament_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
