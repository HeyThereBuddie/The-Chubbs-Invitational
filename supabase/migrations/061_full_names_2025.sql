-- Show 2025 Hall of Fame team names as full names (matching the 2024 fix), for
-- both the top-3 podium cards and the full standings board.
-- Idempotent: matches on name+year, rewrites the standings + podium rows.
do $$
declare
  v_id uuid;
  v_standings jsonb := '[
    {"teamName":"Scott Bailey & Anto Manouk",        "p1Name":"Scott Bailey",    "p2Name":"Anto Manouk",        "toPar":-1,"thru":18,"gross":70},
    {"teamName":"Evan Kosmidis & Danny Nicols",      "p1Name":"Evan Kosmidis",   "p2Name":"Danny Nicols",       "toPar":1, "thru":18,"gross":72},
    {"teamName":"Mark Yeramian & Ross MacDougall",   "p1Name":"Mark Yeramian",   "p2Name":"Ross MacDougall",    "toPar":3, "thru":18,"gross":74},
    {"teamName":"Kevin Gagnon & Christian Bessette", "p1Name":"Kevin Gagnon",    "p2Name":"Christian Bessette", "toPar":5, "thru":18,"gross":76},
    {"teamName":"Tyler Davies & Alex Manouk",        "p1Name":"Tyler Davies",    "p2Name":"Alex Manouk",        "toPar":5, "thru":18,"gross":76},
    {"teamName":"Andrew Manouk & Evan Yarrow",       "p1Name":"Andrew Manouk",   "p2Name":"Evan Yarrow",        "toPar":7, "thru":18,"gross":78},
    {"teamName":"Chris Yeramian & Saunder Reulend",  "p1Name":"Chris Yeramian",  "p2Name":"Saunder Reulend",    "toPar":7, "thru":18,"gross":78},
    {"teamName":"Patrick Losey & Matty Losey",       "p1Name":"Patrick Losey",   "p2Name":"Matty Losey",        "toPar":11,"thru":18,"gross":82},
    {"teamName":"Tucker Mimeault & Ryan French",     "p1Name":"Tucker Mimeault", "p2Name":"Ryan French",        "toPar":11,"thru":18,"gross":82},
    {"teamName":"Geoff Petersen & Adam Fried",       "p1Name":"Geoff Petersen",  "p2Name":"Adam Fried",         "toPar":16,"thru":18,"gross":87}
  ]'::jsonb;
begin
  select id into v_id from public.tournaments
   where year = 2025 and name in ('The Chubbs Memorial', 'The Chubbs Invitational') limit 1;
  if v_id is null then return; end if;

  update public.tournaments set final_standings = v_standings where id = v_id;

  delete from public.tournament_results
   where tournament_id = v_id and category in ('champion','runner_up','third');
  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par) values
    (v_id, 'champion',  'Scott Bailey & Anto Manouk',      'Scott Bailey',  'Anto Manouk',    -1),
    (v_id, 'runner_up', 'Evan Kosmidis & Danny Nicols',    'Evan Kosmidis', 'Danny Nicols',    1),
    (v_id, 'third',     'Mark Yeramian & Ross MacDougall', 'Mark Yeramian', 'Ross MacDougall', 3);
end $$;
