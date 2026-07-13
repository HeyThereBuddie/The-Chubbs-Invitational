-- Live-draw team entry with a pre-loaded roster.
-- Organizers import the expected players (roster), build teams by hand from the
-- draw, and each roster entry links to a real account when that person signs up
-- and "claims" their name. profiles.id references auth.users, so un-registered
-- players can't be profiles yet — the roster fills that gap.

create table if not exists public.roster (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  claimed_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists roster_tournament_idx on public.roster(tournament_id);

alter table public.roster enable row level security;

-- drop-then-create so the migration is safe to re-run (CREATE POLICY has no IF NOT EXISTS)
drop policy if exists "roster: authenticated read" on public.roster;
create policy "roster: authenticated read"
  on public.roster for select to authenticated using (true);

drop policy if exists "roster: admin write" on public.roster;
create policy "roster: admin write"
  on public.roster for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Let a signed-in player claim an UNclaimed roster entry as themselves.
drop policy if exists "roster: claim own" on public.roster;
create policy "roster: claim own"
  on public.roster for update to authenticated
  using (claimed_by is null)
  with check (claimed_by = auth.uid());

-- Teams carry the drawn display names + roster links so a team shows correctly
-- even before both players have accounts. p1_id/p2_id (profiles) fill in on claim.
alter table public.teams add column if not exists p1_name      text;
alter table public.teams add column if not exists p2_name      text;
alter table public.teams add column if not exists p1_roster_id uuid references public.roster(id) on delete set null;
alter table public.teams add column if not exists p2_roster_id uuid references public.roster(id) on delete set null;

-- Claim a roster spot as the current user and link the drawn team, atomically.
-- SECURITY DEFINER so a player can set their own team_id / team slot even though
-- teams are admin-write. It only ever writes the caller's own id, and only for an
-- unclaimed roster entry — so it can't be used to hijack someone else's spot.
create or replace function public.claim_roster_entry(p_roster_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_team public.teams%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update public.roster set claimed_by = v_uid
   where id = p_roster_id and claimed_by is null;
  if not found then return; end if;   -- already claimed or missing — no-op

  select * into v_team from public.teams
   where p1_roster_id = p_roster_id or p2_roster_id = p_roster_id limit 1;
  if found then
    if v_team.p1_roster_id = p_roster_id then
      update public.teams set p1_id = v_uid where id = v_team.id;
    else
      update public.teams set p2_id = v_uid where id = v_team.id;
    end if;
    update public.profiles set team_id = v_team.id where id = v_uid;
  end if;
end;
$$;

grant execute on function public.claim_roster_entry(uuid) to authenticated;
