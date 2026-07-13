-- Cross-team score approval within a foursome. Each team must approve the other
-- team(s) in their group before it can advance to the next hole.

-- 1. Allow multiple approvers per score (future-proof for 3-team groups) and add
--    a status so a team can DISPUTE instead of approve.
alter table public.score_approvals drop constraint if exists score_approvals_score_id_key;
alter table public.score_approvals
  add column if not exists status     text not null default 'approved' check (status in ('approved', 'disputed'));
alter table public.score_approvals
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists score_approvals_score_team_uq
  on public.score_approvals(score_id, approving_team_id);

-- 2. RLS: the approving team manages its own rows; admins can manage any (override).
drop policy if exists "score_approvals: authenticated insert" on public.score_approvals;
drop policy if exists "score_approvals: team insert"  on public.score_approvals;
drop policy if exists "score_approvals: team update"  on public.score_approvals;
drop policy if exists "score_approvals: team delete"  on public.score_approvals;

create policy "score_approvals: team insert" on public.score_approvals
  for insert to authenticated with check (
    public.is_admin() or exists (select 1 from public.profiles where id = auth.uid() and team_id = approving_team_id)
  );
create policy "score_approvals: team update" on public.score_approvals
  for update to authenticated using (
    public.is_admin() or exists (select 1 from public.profiles where id = auth.uid() and team_id = approving_team_id)
  );
create policy "score_approvals: team delete" on public.score_approvals
  for delete to authenticated using (
    public.is_admin() or exists (select 1 from public.profiles where id = auth.uid() and team_id = approving_team_id)
  );

-- 3. Global on/off — off by default so organizers can flip it on when ready.
alter table public.tournament_settings
  add column if not exists approvals_enabled boolean not null default false;

-- 4. Realtime so both teams see approval status update live (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'score_approvals'
  ) then
    alter publication supabase_realtime add table public.score_approvals;
  end if;
end $$;
