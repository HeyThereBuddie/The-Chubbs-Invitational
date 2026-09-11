-- Correct + full-name the 2021 Chubbs Memorial Hall of Fame.
-- 048 had KG & Pat winning the putts tiebreak (25) over Drew & French (32). The
-- actual putts were reversed: Andrew Manouk & Ryan French won at 25, KG & Pat
-- were runner-up at 32. Rewrites standings + podium with full-name labels.
-- Par 72, gross = 72 + to-par. Idempotent: matches on name+year.
do $$
declare
  v_id uuid;
  v_standings jsonb := '[
    {"teamName":"Andrew Manouk & Ryan French",       "p1Name":"Andrew Manouk",   "p2Name":"Ryan French",        "toPar":5, "thru":18,"gross":77,"place":1},
    {"teamName":"Kevin Gagnon & Patrick Losey",      "p1Name":"Kevin Gagnon",    "p2Name":"Patrick Losey",      "toPar":5, "thru":18,"gross":77,"place":2},
    {"teamName":"Scott Bailey & Ross MacDougall",    "p1Name":"Scott Bailey",    "p2Name":"Ross MacDougall",    "toPar":6, "thru":18,"gross":78},
    {"teamName":"Tucker Mimeault & Geoff Petersen",  "p1Name":"Tucker Mimeault", "p2Name":"Geoff Petersen",     "toPar":6, "thru":18,"gross":78},
    {"teamName":"Chris Yeramian & Saunder Reulend",  "p1Name":"Chris Yeramian",  "p2Name":"Saunder Reulend",    "toPar":12,"thru":18,"gross":84},
    {"teamName":"Anto Manouk & Christian Bessette",  "p1Name":"Anto Manouk",     "p2Name":"Christian Bessette", "toPar":14,"thru":18,"gross":86}
  ]'::jsonb;
begin
  select id into v_id from public.tournaments where year = 2021 and name = 'The Chubbs Memorial' limit 1;
  if v_id is null then
    insert into public.tournaments (year, name, status, notes, final_standings)
    values (2021, 'The Chubbs Memorial', 'completed', 'Par 72 · Andrew & French won a putts tiebreak (25 vs 32)', v_standings)
    returning id into v_id;
  else
    update public.tournaments
       set status = 'completed', deleted_at = null,
           notes = 'Par 72 · Andrew & French won a putts tiebreak (25 vs 32)',
           final_standings = v_standings
     where id = v_id;
  end if;

  delete from public.tournament_results where tournament_id = v_id and category in ('champion','runner_up','third');
  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par, detail) values
    (v_id, 'champion',  'Andrew Manouk & Ryan French',    'Andrew Manouk', 'Ryan French',     5, 'Won on a putts tiebreak — 25 putts'),
    (v_id, 'runner_up', 'Kevin Gagnon & Patrick Losey',   'Kevin Gagnon',  'Patrick Losey',   5, '32 putts'),
    (v_id, 'third',     'Scott Bailey & Ross MacDougall', 'Scott Bailey',  'Ross MacDougall', 6, null);
end $$;
