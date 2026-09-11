-- Correct + full-name the 2023 Chubbs Memorial Hall of Fame.
-- 048 recorded Anto & Marco as "did not post a score" with Tuck & Drew champion.
-- Actual result: Anto Manouk & Marco won at Even (0). Rewrites the standings +
-- podium with full-name team labels (matching the 2024/2025 fixes).
-- Par 72, gross = 72 + to-par. Idempotent: matches on name+year.
do $$
declare
  v_id uuid;
  v_standings jsonb := '[
    {"teamName":"Anto Manouk & Marco",              "p1Name":"Anto Manouk",     "p2Name":"Marco",              "toPar":0, "thru":18,"gross":72},
    {"teamName":"Tucker Mimeault & Andrew Manouk",  "p1Name":"Tucker Mimeault", "p2Name":"Andrew Manouk",      "toPar":2, "thru":18,"gross":74},
    {"teamName":"Mark Yeramian & Ryan French",      "p1Name":"Mark Yeramian",   "p2Name":"Ryan French",        "toPar":3, "thru":18,"gross":75},
    {"teamName":"Kevin Gagnon & Adam Fried",        "p1Name":"Kevin Gagnon",    "p2Name":"Adam Fried",         "toPar":4, "thru":18,"gross":76},
    {"teamName":"Scott Bailey & Patrick Losey",     "p1Name":"Scott Bailey",    "p2Name":"Patrick Losey",      "toPar":4, "thru":18,"gross":76},
    {"teamName":"Tyler Davies & Geoff Petersen",    "p1Name":"Tyler Davies",    "p2Name":"Geoff Petersen",     "toPar":4, "thru":18,"gross":76},
    {"teamName":"Evan Kosmidis & Christian Bessette","p1Name":"Evan Kosmidis",  "p2Name":"Christian Bessette", "toPar":5, "thru":18,"gross":77},
    {"teamName":"Chris Yeramian & Ross MacDougall", "p1Name":"Chris Yeramian",  "p2Name":"Ross MacDougall",    "toPar":15,"thru":18,"gross":87}
  ]'::jsonb;
begin
  select id into v_id from public.tournaments where year = 2023 and name = 'The Chubbs Memorial' limit 1;
  if v_id is null then
    insert into public.tournaments (year, name, status, notes, final_standings)
    values (2023, 'The Chubbs Memorial', 'completed', 'Par 72 · Anto & Marco won at Even', v_standings)
    returning id into v_id;
  else
    update public.tournaments
       set status = 'completed', deleted_at = null,
           notes = 'Par 72 · Anto & Marco won at Even',
           final_standings = v_standings
     where id = v_id;
  end if;

  delete from public.tournament_results where tournament_id = v_id and category in ('champion','runner_up','third');
  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par) values
    (v_id, 'champion',  'Anto Manouk & Marco',             'Anto Manouk',     'Marco',          0),
    (v_id, 'runner_up', 'Tucker Mimeault & Andrew Manouk', 'Tucker Mimeault', 'Andrew Manouk',  2),
    (v_id, 'third',     'Mark Yeramian & Ryan French',     'Mark Yeramian',   'Ryan French',    3);
end $$;
