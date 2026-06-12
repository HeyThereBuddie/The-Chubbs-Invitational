-- Maximum number of active players allowed to register for a tournament.
-- Must be an even number (all teams are pairs).
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS player_cap integer;
