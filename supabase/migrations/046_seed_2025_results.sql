-- Backfill the 2025 Chubbs Invitational into the Hall of Fame.
-- Played at Club de Golf Saint-François (Laval, QC), par 71. The right-hand
-- sheet recorded team scores TO PAR (lower is better); gross = 71 + to-par.
-- Idempotent: safe to re-run — upserts the year and rewrites its podium.
-- (tournaments.year is NOT unique since migration 025, so we match on name+year
--  in a DO block rather than ON CONFLICT.)

do $$
declare
  v_id uuid;
  v_standings jsonb := '[
    {"teamName":"SCOTT & ANTO",     "p1Name":"Scott Bailey",    "p2Name":"Anto Manouk",        "toPar":-1,"thru":18,"gross":70},
    {"teamName":"PITTED & DANNY",   "p1Name":"Evan Kosmidis",   "p2Name":"Danny Nicols",       "toPar":1, "thru":18,"gross":72},
    {"teamName":"MARK & ROSS",      "p1Name":"Mark Yeramian",   "p2Name":"Ross MacDougall",    "toPar":3, "thru":18,"gross":74},
    {"teamName":"KG & CHRIS",       "p1Name":"Kevin Gagnon",    "p2Name":"Christian Bessette", "toPar":5, "thru":18,"gross":76},
    {"teamName":"TYLER & ALEX",     "p1Name":"Tyler Davies",    "p2Name":"Alex Manouk",        "toPar":5, "thru":18,"gross":76},
    {"teamName":"DREW & YARROW",    "p1Name":"Andrew Manouk",   "p2Name":"Evan Yarrow",        "toPar":7, "thru":18,"gross":78},
    {"teamName":"CHRIS & SANDER",   "p1Name":"Chris Yeramian",  "p2Name":"Saunder Reulend",    "toPar":7, "thru":18,"gross":78},
    {"teamName":"PAT & MATT",       "p1Name":"Patrick Losey",   "p2Name":"Matty Losey",        "toPar":11,"thru":18,"gross":82},
    {"teamName":"TUCKER & FRENCH",  "p1Name":"Tucker Mimeault", "p2Name":"Ryan French",        "toPar":11,"thru":18,"gross":82},
    {"teamName":"GOOF & FRIED",     "p1Name":"Geoff Petersen",  "p2Name":"Adam Fried",         "toPar":16,"thru":18,"gross":87}
  ]'::jsonb;
begin
  -- Match by year, accepting the old "Invitational" name so a prior run gets renamed.
  select id into v_id from public.tournaments
   where year = 2025 and name in ('The Chubbs Memorial', 'The Chubbs Invitational') limit 1;

  if v_id is null then
    insert into public.tournaments (year, name, date, course, status, notes, final_standings)
    values (2025, 'The Chubbs Memorial', null, 'Club de Golf Saint-François', 'completed',
            'Par 71 · Club de Golf Saint-François, Laval QC', v_standings)
    returning id into v_id;
  else
    update public.tournaments set
      name            = 'The Chubbs Memorial',
      date            = null,
      course          = 'Club de Golf Saint-François',
      status          = 'completed',
      notes           = 'Par 71 · Club de Golf Saint-François, Laval QC',
      final_standings = v_standings,
      deleted_at      = null
    where id = v_id;
  end if;

  -- Podium rows (champion / runner-up / third) for the top-3 cards.
  delete from public.tournament_results
   where tournament_id = v_id and category in ('champion','runner_up','third');

  insert into public.tournament_results (tournament_id, category, team_name, player1_name, player2_name, score_to_par) values
    (v_id, 'champion',  'SCOTT & ANTO',   'Scott Bailey',  'Anto Manouk',    -1),
    (v_id, 'runner_up', 'PITTED & DANNY', 'Evan Kosmidis', 'Danny Nicols',    1),
    (v_id, 'third',     'MARK & ROSS',    'Mark Yeramian', 'Ross MacDougall', 3);
end $$;
