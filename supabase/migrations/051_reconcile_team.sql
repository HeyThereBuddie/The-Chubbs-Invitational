-- Self-heal the two-way player↔team link.
--
-- Background: a team can know a player (teams.p1_id/p2_id, or via a claimed
-- roster entry) while the player's own profile.team_id was never set — e.g. the
-- player registered after the team was drawn, or their sign-up email didn't match
-- their roster entry. The scoring screens read profile.team_id, so those players
-- see "not assigned to a team yet" even though they're clearly paired.
--
-- This function, called by the app when a signed-in player has no team_id, fixes
-- the links for THAT user only. It's SECURITY DEFINER so it can mend the rows
-- (teams write is admin-only under RLS), but it only ever touches the caller's own
-- claimed roster entries and their own profile.
create or replace function public.reconcile_my_team()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then return null; end if;

  -- 1) If this user has claimed a roster entry but the team only stored the roster
  --    link, backfill the team's profile id.
  update public.teams t set p1_id = v_uid
    from public.roster r
   where t.p1_roster_id = r.id and r.claimed_by = v_uid and t.p1_id is null;
  update public.teams t set p2_id = v_uid
    from public.roster r
   where t.p2_roster_id = r.id and r.claimed_by = v_uid and t.p2_id is null;

  -- 2) Find the team that lists this user — prefer the active tournament.
  select t.id into v_team
    from public.teams t
    left join public.tournaments tn on tn.id = t.tournament_id
   where (t.p1_id = v_uid or t.p2_id = v_uid)
   order by (tn.status = 'active') desc nulls last, tn.year desc nulls last, t.created_at desc
   limit 1;

  -- 3) Point the profile back at it (the link that was missing).
  if v_team is not null then
    update public.profiles set team_id = v_team
     where id = v_uid and team_id is distinct from v_team;
  end if;

  return v_team;
end;
$$;

grant execute on function public.reconcile_my_team() to authenticated;
