-- ============================================================
-- The Chubbs Invitational — Schema Migration
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text,
  role        text NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
  handicap    int,
  joined_at   timestamptz NOT NULL DEFAULT now()
);

-- Players (RSVP list — separate from auth accounts)
CREATE TABLE IF NOT EXISTS public.players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text,
  handicap    int,
  rsvp        text NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('in', 'pending', 'out')),
  shirt_size  text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  p1_id       uuid REFERENCES public.players(id) ON DELETE SET NULL,
  p2_id       uuid REFERENCES public.players(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Scores (one row per hole per team)
CREATE TABLE IF NOT EXISTS public.scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  hole        int NOT NULL CHECK (hole BETWEEN 1 AND 18),
  score       int NOT NULL CHECK (score >= 1),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, hole)
);

-- Tee Times
CREATE TABLE IF NOT EXISTS public.tee_times (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  tee_time        time NOT NULL,
  starting_hole   int NOT NULL DEFAULT 1 CHECK (starting_hole BETWEEN 1 AND 18),
  cart            text,
  notes           text
);

-- Updates / Announcements
CREATE TABLE IF NOT EXISTS public.updates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  pinned      bool NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Pairings
CREATE TABLE IF NOT EXISTS public.pairings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a_id     uuid REFERENCES public.players(id) ON DELETE CASCADE,
  player_b_id     uuid REFERENCES public.players(id) ON DELETE CASCADE,
  team_name       text NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now()
);

-- Contest entries
CREATE TABLE IF NOT EXISTS public.contest_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('ctp', 'ld')),
  player_id   uuid REFERENCES public.players(id) ON DELETE CASCADE,
  hole        int NOT NULL CHECK (hole BETWEEN 1 AND 18),
  distance    text NOT NULL,
  photo_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Leahey votes
CREATE TABLE IF NOT EXISTS public.leahey_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nominee_id  uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voter_id)
);

-- ============================================================
-- Trigger: auto-create profile on auth.users insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'player')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Enable Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contest_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leahey_votes;
