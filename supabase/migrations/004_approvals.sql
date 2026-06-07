-- ============================================================
-- Score approval workflow + team-based access control
-- ============================================================

-- Link each auth user to their team
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

-- Helper: returns the current user's team_id
CREATE OR REPLACE FUNCTION public.my_team_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Foursomes ─────────────────────────────────────────────────
-- Pairs two teams together so they can approve each other's scores
CREATE TABLE IF NOT EXISTS public.foursomes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_a_id  uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  team_b_id  uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_a_id),
  UNIQUE(team_b_id)
);

ALTER TABLE public.foursomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "foursomes: authenticated read" ON public.foursomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "foursomes: admin write"        ON public.foursomes FOR ALL    TO authenticated USING (public.is_admin());

-- ── Score approvals ────────────────────────────────────────────
-- One approval record per hole score, written by the partner team
CREATE TABLE IF NOT EXISTS public.score_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id          uuid NOT NULL REFERENCES public.scores(id) ON DELETE CASCADE,
  approving_team_id uuid NOT NULL REFERENCES public.teams(id),
  approved_at       timestamptz DEFAULT now(),
  UNIQUE(score_id)
);

ALTER TABLE public.score_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_approvals: authenticated read"   ON public.score_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "score_approvals: authenticated insert" ON public.score_approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "score_approvals: admin delete"         ON public.score_approvals FOR DELETE TO authenticated USING (public.is_admin());

-- ── Tighten scores write access to own team only ───────────────
DROP POLICY IF EXISTS "scores: authenticated write" ON public.scores;

CREATE POLICY "scores: own team insert"
  ON public.scores FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.my_team_id() = team_id);

CREATE POLICY "scores: own team update"
  ON public.scores FOR UPDATE TO authenticated
  USING  (public.is_admin() OR public.my_team_id() = team_id)
  WITH CHECK (public.is_admin() OR public.my_team_id() = team_id);

CREATE POLICY "scores: admin delete"
  ON public.scores FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── Realtime ───────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.foursomes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.score_approvals;

-- ── Seed foursomes from demo data ─────────────────────────────
INSERT INTO public.foursomes (team_a_id, team_b_id) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000004'),
  ('b1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006'),
  ('b1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000008'),
  ('b1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000010')
ON CONFLICT DO NOTHING;
