-- ============================================================
-- Multi-Year Tracking
-- ============================================================

-- Tournament registry
CREATE TABLE IF NOT EXISTS public.tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year        int NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT 'The Chubbs Memorial',
  date        date,
  course      text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tournament results snapshot (captured when admin ends tournament)
CREATE TABLE IF NOT EXISTS public.tournament_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category       text NOT NULL CHECK (category IN ('champion', 'runner_up', 'third', 'jackass', 'ctp', 'ld')),
  team_name      text,
  player1_name   text,
  player2_name   text,
  player1_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  player2_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  score_to_par   int,
  detail         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments: authenticated read"
  ON public.tournaments FOR SELECT TO authenticated USING (true);

CREATE POLICY "tournaments: admin write"
  ON public.tournaments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "tournament_results: authenticated read"
  ON public.tournament_results FOR SELECT TO authenticated USING (true);

CREATE POLICY "tournament_results: admin write"
  ON public.tournament_results FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed current year as the active tournament
INSERT INTO public.tournaments (year, status)
VALUES (EXTRACT(YEAR FROM NOW())::int, 'active')
ON CONFLICT (year) DO NOTHING;
