-- Shared pin placement per hole per tournament. One row per (tournament, hole);
-- any player can set/move it and everyone sees it live. CTR distance on the GPS
-- screen references this pin when present, else the green center.
create table if not exists public.hole_pins (
  tournament_id uuid        not null references public.tournaments(id) on delete cascade,
  hole          int         not null,
  lat           double precision not null,
  lng           double precision not null,
  set_by        uuid        references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, hole)
);

alter table public.hole_pins enable row level security;

-- Any authenticated player can read and set/move pins.
create policy "hole_pins_select" on public.hole_pins for select using (true);
create policy "hole_pins_insert" on public.hole_pins for insert with check (auth.uid() is not null);
create policy "hole_pins_update" on public.hole_pins for update using (auth.uid() is not null);
create policy "hole_pins_delete" on public.hole_pins for delete using (auth.uid() is not null);

-- Live updates for everyone on the hole.
alter table public.hole_pins replica identity full;
alter publication supabase_realtime add table public.hole_pins;
