-- Backfill Chubbs history: 2019, 2020, 2021, 2023 (no data for 2022 or 2024).
-- Par 72. Scores are +/- par (lower is better); gross = 72 + to-par. All name-
-- only (players didn't have accounts). Idempotent: re-running upserts each year
-- by name+year and rewrites its podium. Uses a session-local helper (pg_temp).

create or replace function pg_temp.seed_chubbs_year(
  p_year int, p_name text, p_notes text, p_standings jsonb, p_podium jsonb
) returns void language plpgsql as $$
declare v_id uuid; r jsonb;
begin
  select id into v_id from public.tournaments where year = p_year and name = p_name limit 1;
  if v_id is null then
    insert into public.tournaments (year, name, date, course, status, notes, final_standings)
    values (p_year, p_name, null, null, 'completed', p_notes, p_standings)
    returning id into v_id;
  else
    update public.tournaments
       set status = 'completed', notes = p_notes, final_standings = p_standings, deleted_at = null
     where id = v_id;
  end if;

  delete from public.tournament_results where tournament_id = v_id and category in ('champion','runner_up','third');
  for r in select value from jsonb_array_elements(p_podium) loop
    insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par, detail)
    values (v_id, r->>'category', r->>'team', r->>'p1', r->>'p2', (r->>'score')::int, r->>'detail');
  end loop;
end $$;

-- 2019 ────────────────────────────────────────────────────────────────────
select pg_temp.seed_chubbs_year(2019, 'The Chubbs Memorial', 'Par 72 · gross team scores', '[
  {"teamName":"Mark & French",  "p1Name":"Mark Yeramian",             "p2Name":"Ryan French",       "toPar":0, "thru":18,"gross":72},
  {"teamName":"Drew & CY",      "p1Name":"Andrew Manouk",             "p2Name":"Chris Yeramian",    "toPar":2, "thru":18,"gross":74},
  {"teamName":"Kenny & Ross",   "p1Name":"Kenny Robichaud",           "p2Name":"Ross MacDougall",   "toPar":3, "thru":18,"gross":75},
  {"teamName":"Gab A & Omar",   "p1Name":"Gab A",                     "p2Name":"Omar (Gab)",        "toPar":3, "thru":18,"gross":75},
  {"teamName":"Scott & Anto",   "p1Name":"Scott Bailey",              "p2Name":"Anto Manouk",       "toPar":5, "thru":18,"gross":77},
  {"teamName":"Matt & Dan",     "p1Name":"Matt Losey",                "p2Name":"Dan Normand",       "toPar":7, "thru":18,"gross":79},
  {"teamName":"Kevin & Saunder", "p1Name":"Kevin Gagnon",              "p2Name":"Saunder Reulend",    "toPar":9, "thru":18,"gross":81},
  {"teamName":"Nic & Patrice",  "p1Name":"Nicolas Averette-Charette", "p2Name":"Patrice Roland",    "toPar":11,"thru":18,"gross":83}
]'::jsonb, '[
  {"category":"champion", "team":"Mark & French","p1":"Mark Yeramian",  "p2":"Ryan French",    "score":0},
  {"category":"runner_up","team":"Drew & CY",    "p1":"Andrew Manouk",  "p2":"Chris Yeramian", "score":2},
  {"category":"third",    "team":"Kenny & Ross", "p1":"Kenny Robichaud","p2":"Ross MacDougall","score":3}
]'::jsonb);

-- 2020 ────────────────────────────────────────────────────────────────────
select pg_temp.seed_chubbs_year(2020, 'The Chubbs Memorial', 'Par 72', '[
  {"teamName":"Tuck & Bailey",   "p1Name":"Tucker Mimeault","p2Name":"Scott Bailey",      "toPar":3, "thru":18,"gross":75},
  {"teamName":"CY & Anto",       "p1Name":"Chris Yeramian", "p2Name":"Anto Manouk",       "toPar":4, "thru":18,"gross":76},
  {"teamName":"Pat & Jesse",     "p1Name":"Patrick Losey",  "p2Name":"Jesse",             "toPar":10,"thru":18,"gross":82},
  {"teamName":"Drew & Christian","p1Name":"Andrew Manouk",  "p2Name":"Christian Bessette","toPar":12,"thru":18,"gross":84},
  {"teamName":"Saunder & Ty",     "p1Name":"Saunder Reulend", "p2Name":"Tyler Davies",      "toPar":12,"thru":18,"gross":84},
  {"teamName":"KG & Fried",      "p1Name":"Kevin Gagnon",   "p2Name":"Adam Fried",        "toPar":13,"thru":18,"gross":85},
  {"teamName":"Mark & Ross",     "p1Name":"Mark Yeramian",  "p2Name":"Ross MacDougall",   "toPar":15,"thru":18,"gross":87},
  {"teamName":"Geoff & Yarrow",  "p1Name":"Geoff Petersen", "p2Name":"Evan Yarrow",       "toPar":16,"thru":18,"gross":88}
]'::jsonb, '[
  {"category":"champion", "team":"Tuck & Bailey","p1":"Tucker Mimeault","p2":"Scott Bailey","score":3},
  {"category":"runner_up","team":"CY & Anto",    "p1":"Chris Yeramian",  "p2":"Anto Manouk",  "score":4},
  {"category":"third",    "team":"Pat & Jesse",  "p1":"Patrick Losey",   "p2":"Jesse",        "score":10}
]'::jsonb);

-- 2021 ────────────────────────────────────────────────────────────────────
select pg_temp.seed_chubbs_year(2021, 'The Chubbs Memorial', 'Par 72 · KG & Pat won a putts tiebreak (25 vs 32)', '[
  {"teamName":"KG & Pat",        "p1Name":"Kevin Gagnon",  "p2Name":"Patrick Losey",     "toPar":5, "thru":18,"gross":77,"place":1},
  {"teamName":"Drew & French",   "p1Name":"Andrew Manouk", "p2Name":"Ryan French",       "toPar":5, "thru":18,"gross":77,"place":2},
  {"teamName":"Scott & Ross",    "p1Name":"Scott Bailey",  "p2Name":"Ross MacDougall",   "toPar":6, "thru":18,"gross":78},
  {"teamName":"Tuck & Geoff",    "p1Name":"Tucker Mimeault","p2Name":"Geoff Petersen",   "toPar":6, "thru":18,"gross":78},
  {"teamName":"CY & Saunder",     "p1Name":"Chris Yeramian","p2Name":"Saunder Reulend",    "toPar":12,"thru":18,"gross":84},
  {"teamName":"Anto & Christian","p1Name":"Anto Manouk",   "p2Name":"Christian Bessette","toPar":14,"thru":18,"gross":86}
]'::jsonb, '[
  {"category":"champion", "team":"KG & Pat",     "p1":"Kevin Gagnon", "p2":"Patrick Losey",   "score":5,"detail":"Won on a putts tiebreak — 25 putts"},
  {"category":"runner_up","team":"Drew & French","p1":"Andrew Manouk","p2":"Ryan French",     "score":5,"detail":"32 putts"},
  {"category":"third",    "team":"Scott & Ross", "p1":"Scott Bailey", "p2":"Ross MacDougall", "score":6}
]'::jsonb);

-- 2023 ────────────────────────────────────────────────────────────────────
select pg_temp.seed_chubbs_year(2023, 'The Chubbs Memorial', 'Par 72 · Anto & Marco (Anto Manouk & Marco) did not post a score', '[
  {"teamName":"Tuck & Drew",     "p1Name":"Tucker Mimeault","p2Name":"Andrew Manouk",     "toPar":2, "thru":18,"gross":74},
  {"teamName":"Mark and French", "p1Name":"Mark Yeramian",  "p2Name":"Ryan French",       "toPar":3, "thru":18,"gross":75},
  {"teamName":"KG and Fried",    "p1Name":"Kevin Gagnon",   "p2Name":"Adam Fried",        "toPar":4, "thru":18,"gross":76},
  {"teamName":"Scott & Pat",     "p1Name":"Scott Bailey",   "p2Name":"Patrick Losey",     "toPar":4, "thru":18,"gross":76},
  {"teamName":"Ty & Geoff",      "p1Name":"Tyler Davies",   "p2Name":"Geoff Petersen",    "toPar":4, "thru":18,"gross":76},
  {"teamName":"Pitted and Chris","p1Name":"Evan Kosmidis",  "p2Name":"Christian Bessette","toPar":5, "thru":18,"gross":77},
  {"teamName":"CY and Ross",     "p1Name":"Chris Yeramian", "p2Name":"Ross MacDougall",   "toPar":15,"thru":18,"gross":87},
  {"teamName":"Anto & Marco",    "p1Name":"Anto Manouk",    "p2Name":"Marco",             "toPar":0, "thru":0, "gross":0, "noScore":true}
]'::jsonb, '[
  {"category":"champion", "team":"Tuck & Drew",    "p1":"Tucker Mimeault","p2":"Andrew Manouk","score":2},
  {"category":"runner_up","team":"Mark and French","p1":"Mark Yeramian",  "p2":"Ryan French",  "score":3},
  {"category":"third",    "team":"KG and Fried",   "p1":"Kevin Gagnon",   "p2":"Adam Fried",   "score":4}
]'::jsonb);
