-- Admin escape hatch: force-settle one hole for one foursome.
--
-- The mutual approval gate means each team can block the other from advancing. If
-- a team is absent or their phone is dead, the rest of the foursome can get stuck
-- on a hole with no way to self-resolve. This lets an admin mark a specific hole
-- settled for a specific tee-time group so the remaining team(s) advance — without
-- disabling approvals for the whole field. Scoped by tee_time (a foursome shares
-- one tee time).

create table if not exists public.approval_overrides (
  id         uuid primary key default gen_random_uuid(),
  tee_time   text not null,
  hole       int  not null check (hole between 1 and 18),
  created_at timestamptz default now(),
  unique (tee_time, hole)
);

alter table public.approval_overrides enable row level security;

create policy "approval_overrides read" on public.approval_overrides
  for select to authenticated using (true);
create policy "approval_overrides admin write" on public.approval_overrides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Realtime so a force-settle reaches the stuck players' phones immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approval_overrides'
  ) then
    alter publication supabase_realtime add table public.approval_overrides;
  end if;
end $$;
