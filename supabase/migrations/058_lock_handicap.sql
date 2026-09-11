-- Handicaps drive the team pairings, so only organizers may set them. Players
-- can read their handicap but never change it — not from the Account page, not
-- from an RSVP link, and not by hitting the API directly.
--
-- RLS is row-level, so it can't protect a single column on a row the user is
-- otherwise allowed to update (their own profile). A BEFORE UPDATE trigger does:
-- for a non-admin, any attempt to change handicap is silently reverted to the
-- stored value. Admin writes (roster import, RSVP admin, admin editing a
-- profile) pass straight through.

create or replace function public.lock_handicap_for_non_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and new.handicap is distinct from old.handicap then
    new.handicap := old.handicap;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_handicap on public.profiles;
create trigger lock_handicap
  before update on public.profiles
  for each row
  execute function public.lock_handicap_for_non_admins();
