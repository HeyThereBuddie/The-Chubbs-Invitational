-- Full-name the 2019 Chubbs Memorial Hall of Fame team labels (results unchanged,
-- matching the 2020–2025 fixes). Uses the fullest names on record; Gab A / Omar
-- are only partial (that's all we have). Par 72, gross = 72 + to-par. Idempotent.
do $$
declare
  v_id uuid;
  v_standings jsonb := '[
    {"teamName":"Mark Yeramian & Ryan French",                 "p1Name":"Mark Yeramian",             "p2Name":"Ryan French",       "toPar":0, "thru":18,"gross":72},
    {"teamName":"Andrew Manouk & Chris Yeramian",              "p1Name":"Andrew Manouk",             "p2Name":"Chris Yeramian",    "toPar":2, "thru":18,"gross":74},
    {"teamName":"Kenny Robichaud & Ross MacDougall",           "p1Name":"Kenny Robichaud",           "p2Name":"Ross MacDougall",   "toPar":3, "thru":18,"gross":75},
    {"teamName":"Gab A & Omar",                                "p1Name":"Gab A",                     "p2Name":"Omar (Gab)",        "toPar":3, "thru":18,"gross":75},
    {"teamName":"Scott Bailey & Anto Manouk",                  "p1Name":"Scott Bailey",              "p2Name":"Anto Manouk",       "toPar":5, "thru":18,"gross":77},
    {"teamName":"Matt Losey & Dan Normand",                    "p1Name":"Matt Losey",                "p2Name":"Dan Normand",       "toPar":7, "thru":18,"gross":79},
    {"teamName":"Kevin Gagnon & Saunder Reulend",              "p1Name":"Kevin Gagnon",              "p2Name":"Saunder Reulend",   "toPar":9, "thru":18,"gross":81},
    {"teamName":"Nicolas Averette-Charette & Patrice Roland",  "p1Name":"Nicolas Averette-Charette", "p2Name":"Patrice Roland",    "toPar":11,"thru":18,"gross":83}
  ]'::jsonb;
begin
  select id into v_id from public.tournaments where year = 2019 and name = 'The Chubbs Memorial' limit 1;
  if v_id is null then
    insert into public.tournaments (year, name, status, notes, final_standings)
    values (2019, 'The Chubbs Memorial', 'completed', 'Par 72 · gross team scores', v_standings)
    returning id into v_id;
  else
    update public.tournaments
       set status = 'completed', deleted_at = null, notes = 'Par 72 · gross team scores', final_standings = v_standings
     where id = v_id;
  end if;

  delete from public.tournament_results where tournament_id = v_id and category in ('champion','runner_up','third');
  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par) values
    (v_id, 'champion',  'Mark Yeramian & Ryan French',      'Mark Yeramian',   'Ryan French',     0),
    (v_id, 'runner_up', 'Andrew Manouk & Chris Yeramian',   'Andrew Manouk',   'Chris Yeramian',  2),
    (v_id, 'third',     'Kenny Robichaud & Ross MacDougall','Kenny Robichaud', 'Ross MacDougall', 3);
end $$;
