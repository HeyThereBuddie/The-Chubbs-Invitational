-- ============================================================
-- Unify players into profiles + waitlist support
-- ============================================================

-- 1. Add player-specific columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waitlist', 'dropped'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shirt_size text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notes      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone      text;

-- 2. Clear all demo data (preserves existing auth accounts / profiles)
DELETE FROM public.leahey_votes;
DELETE FROM public.contest_entries;
DELETE FROM public.score_approvals;
DELETE FROM public.pairings;
DELETE FROM public.foursomes;
DELETE FROM public.scores;
DELETE FROM public.tee_times;
DELETE FROM public.teams;
DELETE FROM public.updates;
DELETE FROM public.players;

-- 3. Rewire FK constraints from players → profiles

-- teams.p1_id / p2_id
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_p1_id_fkey;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_p2_id_fkey;
ALTER TABLE public.teams ADD CONSTRAINT teams_p1_id_fkey FOREIGN KEY (p1_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.teams ADD CONSTRAINT teams_p2_id_fkey FOREIGN KEY (p2_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- pairings
ALTER TABLE public.pairings DROP CONSTRAINT IF EXISTS pairings_player_a_id_fkey;
ALTER TABLE public.pairings DROP CONSTRAINT IF EXISTS pairings_player_b_id_fkey;
ALTER TABLE public.pairings ADD CONSTRAINT pairings_player_a_id_fkey FOREIGN KEY (player_a_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.pairings ADD CONSTRAINT pairings_player_b_id_fkey FOREIGN KEY (player_b_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- contest_entries
ALTER TABLE public.contest_entries DROP CONSTRAINT IF EXISTS contest_entries_player_id_fkey;
ALTER TABLE public.contest_entries ADD CONSTRAINT contest_entries_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- leahey_votes (nominee)
ALTER TABLE public.leahey_votes DROP CONSTRAINT IF EXISTS leahey_votes_nominee_id_fkey;
ALTER TABLE public.leahey_votes ADD CONSTRAINT leahey_votes_nominee_id_fkey FOREIGN KEY (nominee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. Drop the now-redundant players table
DROP TABLE IF EXISTS public.players;

-- 5. Allow anon to read profiles (for public RSVP landing page)
CREATE POLICY "profiles: anon read"
  ON public.profiles FOR SELECT TO anon USING (true);

-- 6. Update trigger: read status from registration metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'player'),
    COALESCE(NEW.raw_user_meta_data->>'status', 'active')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
