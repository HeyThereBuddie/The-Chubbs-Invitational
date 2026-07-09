-- Shot tracking becomes team-based: add team_id and let teammates (and team
-- browsing) read each other's shots. Writes stay authenticated.
alter table public.shots add column if not exists team_id uuid references public.teams(id) on delete cascade;
create index if not exists shots_team_idx on public.shots (team_id, created_at desc);

drop policy if exists "shots_select" on public.shots;
drop policy if exists "shots_insert" on public.shots;
drop policy if exists "shots_delete" on public.shots;

create policy "shots_select" on public.shots for select using (auth.uid() is not null);
create policy "shots_insert" on public.shots for insert with check (auth.uid() is not null);
create policy "shots_update" on public.shots for update using (auth.uid() is not null);
create policy "shots_delete" on public.shots for delete using (auth.uid() is not null);
