-- Correct the 2024 Chubbs Memorial champion.
-- 049 recorded Scott & Anto; the actual 2024 winners were Kevin Gagnon &
-- Geoff Petersen ("KG & GOOF"). Rewrites the champion row for the Hall of Fame
-- (top-3 cards) and so Chubbs' AI cites the right repeat winners.
-- Idempotent: matches on name+year, rewrites the champion row.
do $$
declare v_id uuid;
begin
  select id into v_id from public.tournaments where year = 2024 and name = 'The Chubbs Memorial' limit 1;
  if v_id is null then
    insert into public.tournaments (year, name, status, notes)
    values (2024, 'The Chubbs Memorial', 'completed', 'Champion on record only — full standings not recovered')
    returning id into v_id;
  else
    update public.tournaments
       set status = 'completed', deleted_at = null,
           notes = 'Champion on record only — full standings not recovered'
     where id = v_id;
  end if;

  delete from public.tournament_results where tournament_id = v_id and category in ('champion','runner_up','third');
  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name)
  values (v_id, 'champion', 'Kevin Gagnon & Geoff Petersen', 'Kevin Gagnon', 'Geoff Petersen');
end $$;
