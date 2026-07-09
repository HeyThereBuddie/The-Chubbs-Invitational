-- Backfill team_id on shots tracked before shots went team-based, by matching
-- each shot's player + tournament to their team. Run after 037.
update public.shots s
set team_id = t.id
from public.teams t
where s.team_id is null
  and t.tournament_id = s.tournament_id
  and (t.p1_id = s.player_id or t.p2_id = s.player_id);

-- Fallback for shots whose tournament_id didn't line up: match on player alone
-- when the player belongs to exactly one team.
update public.shots s
set team_id = t.id
from public.teams t
where s.team_id is null
  and (t.p1_id = s.player_id or t.p2_id = s.player_id)
  and (select count(*) from public.teams t2 where t2.p1_id = s.player_id or t2.p2_id = s.player_id) = 1;
