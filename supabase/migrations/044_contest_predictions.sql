-- AI-generated contest predictions (Chubbs' picks). One row per generation;
-- the app reads the latest per tournament. Generated manually by an admin only.
create table if not exists public.contest_predictions (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  payload       jsonb not null,
  generated_at  timestamptz not null default now(),
  generated_by  uuid references public.profiles(id) on delete set null
);
create index if not exists contest_predictions_tournament_idx
  on public.contest_predictions(tournament_id, generated_at desc);

alter table public.contest_predictions enable row level security;

drop policy if exists "contest_predictions: read" on public.contest_predictions;
create policy "contest_predictions: read" on public.contest_predictions
  for select to authenticated using (true);

drop policy if exists "contest_predictions: admin write" on public.contest_predictions;
create policy "contest_predictions: admin write" on public.contest_predictions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contest_predictions') then
    alter publication supabase_realtime add table public.contest_predictions;
  end if;
end $$;
