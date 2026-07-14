-- Permanently remove the 5 test tournaments sitting in "Deleted Years".
-- Scoped to soft-deleted rows only (deleted_at IS NOT NULL) so a live/active
-- tournament sharing a name can never be hit.
--
-- Several FKs added in migration 024 (teams, contest_entries, leahey_votes,
-- feed_events) have NO on-delete-cascade, so we clear child rows first. teams
-- itself is blocked by profiles.team_id and score_approvals.approving_team_id,
-- which we detach/clear before dropping the teams. Everything else
-- (roster, hole_pins, contest_predictions, tournament_results, shots, scores,
-- tee_times, foursomes, chulligans) cascades on its own.
do $$
declare
  v_ids      uuid[];
  v_team_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.tournaments
   where deleted_at is not null
     and name in (
       'The Chubbs test 3',
       'The Chubbs Memorial 2026',
       'The Chubbs Memorial',
       'The Chubbs Memorial - 2026 - Test',
       'The Chubbs Memorial - 2026 - test 2'
     );
  if v_ids is null then return; end if;   -- nothing to remove

  select array_agg(id) into v_team_ids from public.teams where tournament_id = any(v_ids);

  -- Direct non-cascade referrers of tournaments.
  delete from public.contest_entries where tournament_id = any(v_ids);
  delete from public.leahey_votes    where tournament_id = any(v_ids);
  delete from public.feed_events     where tournament_id = any(v_ids);

  -- Teams + their non-cascade blockers (scores/tee_times/foursomes/etc. cascade).
  if v_team_ids is not null then
    delete from public.score_approvals where approving_team_id = any(v_team_ids);
    update public.profiles set team_id = null where team_id = any(v_team_ids);
    delete from public.teams where id = any(v_team_ids);
  end if;

  -- Finally the tournaments themselves.
  delete from public.tournaments where id = any(v_ids);
end $$;
