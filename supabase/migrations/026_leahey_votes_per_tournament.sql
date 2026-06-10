-- Change leahey_votes unique constraint to be per-tournament.
-- Previously UNIQUE(voter_id) meant one vote per player ever across all years.
-- Now UNIQUE(voter_id, tournament_id) allows one vote per player per tournament.

ALTER TABLE public.leahey_votes
  DROP CONSTRAINT IF EXISTS leahey_votes_voter_id_key;

ALTER TABLE public.leahey_votes
  ADD CONSTRAINT leahey_votes_voter_tournament_unique
  UNIQUE (voter_id, tournament_id);
