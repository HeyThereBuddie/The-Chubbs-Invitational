-- 2024 Chubbs Memorial — only the champion is known (no full standings/scores
-- recovered). Records the year with Scott & Anto as champions so it shows in the
-- Hall of Fame (top-3 cards) and Chubbs' AI can cite them as repeat winners.
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
  values (v_id, 'champion', 'Scott & Anto', 'Scott Bailey', 'Anto Manouk');
end $$;
