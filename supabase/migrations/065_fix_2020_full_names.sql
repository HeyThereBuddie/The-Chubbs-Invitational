-- Full-name the 2020 Chubbs Memorial Hall of Fame team labels (results unchanged,
-- matching the 2021–2025 fixes). Par 72, gross = 72 + to-par. Idempotent.
do $$
declare
  v_id uuid;
  v_standings jsonb := '[
    {"teamName":"Tucker Mimeault & Scott Bailey",      "p1Name":"Tucker Mimeault", "p2Name":"Scott Bailey",       "toPar":3, "thru":18,"gross":75},
    {"teamName":"Chris Yeramian & Anto Manouk",        "p1Name":"Chris Yeramian",  "p2Name":"Anto Manouk",        "toPar":4, "thru":18,"gross":76},
    {"teamName":"Patrick Losey & Jesse",               "p1Name":"Patrick Losey",   "p2Name":"Jesse",              "toPar":10,"thru":18,"gross":82},
    {"teamName":"Andrew Manouk & Christian Bessette",  "p1Name":"Andrew Manouk",   "p2Name":"Christian Bessette", "toPar":12,"thru":18,"gross":84},
    {"teamName":"Saunder Reulend & Tyler Davies",      "p1Name":"Saunder Reulend", "p2Name":"Tyler Davies",       "toPar":12,"thru":18,"gross":84},
    {"teamName":"Kevin Gagnon & Adam Fried",           "p1Name":"Kevin Gagnon",    "p2Name":"Adam Fried",         "toPar":13,"thru":18,"gross":85},
    {"teamName":"Mark Yeramian & Ross MacDougall",     "p1Name":"Mark Yeramian",   "p2Name":"Ross MacDougall",    "toPar":15,"thru":18,"gross":87},
    {"teamName":"Geoff Petersen & Evan Yarrow",        "p1Name":"Geoff Petersen",  "p2Name":"Evan Yarrow",        "toPar":16,"thru":18,"gross":88}
  ]'::jsonb;
begin
  select id into v_id from public.tournaments where year = 2020 and name = 'The Chubbs Memorial' limit 1;
  if v_id is null then
    insert into public.tournaments (year, name, status, notes, final_standings)
    values (2020, 'The Chubbs Memorial', 'completed', 'Par 72', v_standings)
    returning id into v_id;
  else
    update public.tournaments
       set status = 'completed', deleted_at = null, notes = 'Par 72', final_standings = v_standings
     where id = v_id;
  end if;

  delete from public.tournament_results where tournament_id = v_id and category in ('champion','runner_up','third');
  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par) values
    (v_id, 'champion',  'Tucker Mimeault & Scott Bailey', 'Tucker Mimeault', 'Scott Bailey',  3),
    (v_id, 'runner_up', 'Chris Yeramian & Anto Manouk',   'Chris Yeramian',  'Anto Manouk',   4),
    (v_id, 'third',     'Patrick Losey & Jesse',          'Patrick Losey',   'Jesse',        10);
end $$;
