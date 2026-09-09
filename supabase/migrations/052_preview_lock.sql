-- Preview / pre-launch lock.
--
-- Lets everyone register, log in, browse, and take the guided tour ahead of time,
-- while blocking non-admins from writing any GAMEPLAY data until the admin flips
-- the tournament live. Registration, profile setup, and all reads stay open.
--
-- Enforced with RESTRICTIVE policies that AND on top of the existing permissive
-- ones (so nothing existing changes) and only cover writes (INSERT/UPDATE/DELETE) —
-- reads are untouched.

-- The switch (singleton settings row). Default false = preview.
alter table public.tournament_settings add column if not exists live boolean not null default false;

-- Is the tournament live? (security definer so it reads the flag regardless of RLS)
create or replace function public.is_live()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select live from public.tournament_settings where id = 1), false)
$$;
grant execute on function public.is_live() to authenticated;

-- Apply the write-lock to every gameplay-writing table.
do $$
declare t text;
begin
  foreach t in array array[
    'scores', 'chulligans', 'contest_entries', 'leahey_votes',
    'score_approvals', 'feed_events', 'shots'
  ] loop
    execute format('drop policy if exists "preview lock: insert" on public.%I', t);
    execute format('drop policy if exists "preview lock: update" on public.%I', t);
    execute format('drop policy if exists "preview lock: delete" on public.%I', t);
    execute format($f$create policy "preview lock: insert" on public.%I as restrictive
      for insert to authenticated with check (public.is_admin() or public.is_live())$f$, t);
    execute format($f$create policy "preview lock: update" on public.%I as restrictive
      for update to authenticated using (public.is_admin() or public.is_live()) with check (public.is_admin() or public.is_live())$f$, t);
    execute format($f$create policy "preview lock: delete" on public.%I as restrictive
      for delete to authenticated using (public.is_admin() or public.is_live())$f$, t);
  end loop;
end $$;
