-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tee_times      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.updates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leahey_votes   ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── profiles ──────────────────────────────────────────────
-- Users can read all profiles; only own profile or admins can update
CREATE POLICY "profiles: authenticated read all"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "profiles: user update own"
  ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles: admin full"
  ON public.profiles FOR ALL
  TO authenticated USING (public.is_admin());

-- ── players ───────────────────────────────────────────────
CREATE POLICY "players: authenticated read"
  ON public.players FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "players: anon read (for rsvp landing)"
  ON public.players FOR SELECT
  TO anon USING (true);

CREATE POLICY "players: admin write"
  ON public.players FOR ALL
  TO authenticated USING (public.is_admin());

CREATE POLICY "players: anon update own rsvp"
  ON public.players FOR UPDATE
  TO anon USING (true);

-- ── teams ─────────────────────────────────────────────────
CREATE POLICY "teams: authenticated read"
  ON public.teams FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "teams: admin write"
  ON public.teams FOR ALL
  TO authenticated USING (public.is_admin());

-- ── scores ────────────────────────────────────────────────
CREATE POLICY "scores: authenticated read"
  ON public.scores FOR SELECT
  TO authenticated USING (true);

-- All authenticated users can enter/update scores (players on course)
CREATE POLICY "scores: authenticated write"
  ON public.scores FOR ALL
  TO authenticated USING (true);

-- ── tee_times ─────────────────────────────────────────────
CREATE POLICY "tee_times: authenticated read"
  ON public.tee_times FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "tee_times: admin write"
  ON public.tee_times FOR ALL
  TO authenticated USING (public.is_admin());

-- ── updates ───────────────────────────────────────────────
CREATE POLICY "updates: authenticated read"
  ON public.updates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "updates: admin write"
  ON public.updates FOR ALL
  TO authenticated USING (public.is_admin());

-- ── pairings ──────────────────────────────────────────────
CREATE POLICY "pairings: authenticated read"
  ON public.pairings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "pairings: admin write"
  ON public.pairings FOR ALL
  TO authenticated USING (public.is_admin());

-- ── contest_entries ───────────────────────────────────────
CREATE POLICY "contest_entries: authenticated read"
  ON public.contest_entries FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "contest_entries: authenticated write"
  ON public.contest_entries FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "contest_entries: admin delete"
  ON public.contest_entries FOR DELETE
  TO authenticated USING (public.is_admin());

-- ── leahey_votes ──────────────────────────────────────────
CREATE POLICY "leahey_votes: authenticated read"
  ON public.leahey_votes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "leahey_votes: authenticated insert own"
  ON public.leahey_votes FOR INSERT
  TO authenticated WITH CHECK (voter_id = auth.uid());

CREATE POLICY "leahey_votes: admin delete"
  ON public.leahey_votes FOR DELETE
  TO authenticated USING (public.is_admin());
