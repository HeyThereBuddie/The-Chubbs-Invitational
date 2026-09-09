-- Ryder Cup overlay — a points game layered on top of the existing scores.
-- Fully ADDITIVE and read-only: nothing here changes how scoring, approvals, or
-- the main leaderboard work. The tile derives everything from the scores that are
-- already recorded; these columns only store the squad setup.

-- Which Ryder Cup squad a team is on: 'A', 'B', or NULL (not participating).
alter table public.teams add column if not exists ryder_squad text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_ryder_squad_chk') then
    -- NULL is allowed (team simply isn't in the Ryder Cup); only 'A'/'B' otherwise.
    alter table public.teams
      add constraint teams_ryder_squad_chk check (ryder_squad in ('A', 'B')) not valid;
  end if;
end $$;

-- Enable flag (tile is hidden until an admin turns it on) + the two squad names.
alter table public.tournament_settings add column if not exists ryder_enabled     boolean not null default false;
alter table public.tournament_settings add column if not exists ryder_squad_a_name text not null default 'Team Drew';
alter table public.tournament_settings add column if not exists ryder_squad_b_name text not null default 'Team Kage';
