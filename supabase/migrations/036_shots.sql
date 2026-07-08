-- GPS shot tracking: one row per tracked shot, private to the player. Feeds the
-- Stats & History view and lets Chubbs rib the player on a bad previous shot.
create table if not exists public.shots (
  id            uuid        primary key default gen_random_uuid(),
  tournament_id uuid        references public.tournaments(id) on delete cascade,
  player_id     uuid        not null references public.profiles(id) on delete cascade,
  hole          int,
  club          text,
  start_lat     double precision,
  start_lng     double precision,
  end_lat       double precision,
  end_lng       double precision,
  distance_yds  int,
  offline_yds   int,        -- signed: + = right of the aim line, - = left
  created_at    timestamptz not null default now()
);

alter table public.shots enable row level security;

-- Each player only sees and writes their own shots.
create policy "shots_select" on public.shots for select using (auth.uid() = player_id);
create policy "shots_insert" on public.shots for insert with check (auth.uid() = player_id);
create policy "shots_delete" on public.shots for delete using (auth.uid() = player_id);

create index if not exists shots_player_idx on public.shots (player_id, created_at desc);
