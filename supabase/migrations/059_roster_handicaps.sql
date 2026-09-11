-- Set the confirmed Fall 2026 field handicaps on the roster (the source of truth
-- that flows to each player's profile when they register/claim). Also swaps the
-- roster: adds Evan Yarrow, removes Danny Nicols.
--
-- Roster-only on purpose: profiles.handicap is guarded by the lock_handicap
-- trigger (058), which reverts writes from anyone the SQL editor isn't
-- authenticated as an admin for. Registered players pick these up via the
-- roster→profile sync on claim; to change an already-registered player's
-- handicap after the fact, edit it in Player Management → Roster (that runs as
-- the admin and syncs the profile).

do $$
declare t_id uuid;
begin
  select id into t_id from public.tournaments where status = 'active' order by year desc limit 1;
  if t_id is null then raise notice 'No active tournament — nothing to do'; return; end if;

  update public.roster set handicap = v.hcp
  from (values
    ('kevin gagnon', 7),  ('andrew manouk', 11), ('evan kosmidis', 7),   ('scott bailey', 13),
    ('tyler davies', 12), ('mark yeramian', 10), ('chris yeramian', 14), ('geoff petersen', 12),
    ('patrick losey', 17),('tucker mimeault', 20),('alex manouk', 30),   ('anto manouk', 24),
    ('ross macdougall', 30),('ryan french', 24), ('matt bliss', 25),     ('christian bessette', 30),
    ('saunder reulend', 30),('dave hill', 30),   ('matty losey', 25)
  ) as v(name, hcp)
  where roster.tournament_id = t_id and lower(roster.name) = v.name;

  delete from public.roster
   where tournament_id = t_id and lower(name) = 'danny nicols';

  insert into public.roster (tournament_id, name, handicap)
  select t_id, 'Evan Yarrow', 24
  where not exists (
    select 1 from public.roster where tournament_id = t_id and lower(name) = 'evan yarrow'
  );
end $$;
