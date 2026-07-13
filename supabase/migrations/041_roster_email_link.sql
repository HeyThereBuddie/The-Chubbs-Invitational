-- Email-as-identifier onboarding for the roster.
-- The organizer's roster (name + handicap) is the source of truth. When a player
-- signs up, we match their email to a roster entry and auto-link everything:
-- claim the roster spot, copy the canonical name + handicap onto their profile,
-- and drop them onto their drawn team. No manual "which player are you?" step.

alter table public.roster add column if not exists handicap int;

-- Claim by tapping your name (fallback path) — now also applies the roster's
-- canonical name + handicap to the profile.
create or replace function public.claim_roster_entry(p_roster_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_r    public.roster%rowtype;
  v_team public.teams%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update public.roster set claimed_by = v_uid where id = p_roster_id and claimed_by is null;
  if not found then return; end if;

  select * into v_r from public.roster where id = p_roster_id;
  update public.profiles
     set name = v_r.name, handicap = coalesce(v_r.handicap, handicap)
   where id = v_uid;

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

-- Auto-link on sign-up: match the new account's email to an unclaimed roster
-- entry (case-insensitive) and wire everything up.
create or replace function public.link_roster_by_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(new.email));
  v_r     public.roster%rowtype;
  v_team  public.teams%rowtype;
begin
  if v_email is null or v_email = '' then return new; end if;

  select * into v_r from public.roster
   where claimed_by is null and lower(trim(email)) = v_email limit 1;
  if not found then return new; end if;

  update public.roster set claimed_by = new.id where id = v_r.id;
  update public.profiles
     set name = v_r.name, handicap = coalesce(v_r.handicap, handicap)
   where id = new.id;

  select * into v_team from public.teams
   where p1_roster_id = v_r.id or p2_roster_id = v_r.id limit 1;
  if found then
    if v_team.p1_roster_id = v_r.id then
      update public.teams set p1_id = new.id where id = v_team.id;
    else
      update public.teams set p2_id = new.id where id = v_team.id;
    end if;
    update public.profiles set team_id = v_team.id where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists link_roster_after_profile_insert on public.profiles;
create trigger link_roster_after_profile_insert
  after insert on public.profiles
  for each row execute function public.link_roster_by_email();

-- Seed the 2026 field (name + handicap, emails added later) into the active
-- tournament's roster. Idempotent — skips anyone already on the roster.
insert into public.roster (tournament_id, name, handicap)
select t.id, v.name, v.handicap
from (values
  ('Kevin Gagnon', 8),  ('Andrew Manouk', 11), ('Evan Kosmidis', 7),  ('Scott Bailey', 13),
  ('Tyler Davies', 16), ('Mark Yeramian', 10), ('Chris Yeramian', 14), ('Geoff Petersen', 18),
  ('Patrick Losey', 18),('Tucker Mimeault', 20),('Alex Manouk', 28),   ('Anto Manouk', 24),
  ('Ross MacDougall', 30),('Ryan French', 25), ('Matt Bliss', 25),     ('Christian Bessette', 30),
  ('Saunder Reulend', 30),('Dave Hill', 30),   ('Danny Nicols', 25),   ('Matty Losey', 24)
) as v(name, handicap)
cross join lateral (
  select id from public.tournaments where status = 'active' order by year desc limit 1
) t
where not exists (
  select 1 from public.roster r
   where r.tournament_id = t.id and lower(r.name) = lower(v.name)
);
