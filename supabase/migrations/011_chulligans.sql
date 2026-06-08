-- ============================================================
-- Chulligans — 1 mulligan per player per nine (must chug/shotgun a beer)
-- ============================================================

CREATE TABLE public.chulligans (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid        NOT NULL REFERENCES public.teams(id)    ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  half       text        NOT NULL CHECK (half IN ('front', 'back')),
  hole       int         NOT NULL CHECK (hole BETWEEN 1 AND 18),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, player_id, half)
);

ALTER TABLE public.chulligans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chulligans: authenticated read"
  ON public.chulligans FOR SELECT TO authenticated USING (true);

-- Any authenticated user can write (same trust model as scores)
CREATE POLICY "chulligans: authenticated write"
  ON public.chulligans FOR ALL TO authenticated USING (true);
