-- Demo/estimated club distances on the roster so Chubbs' predictions have data
-- to chew on before players have logged their real bags. The roster (name +
-- handicap) is the field; once a player claims their account and logs real club
-- distances, their profile data overrides this. Estimates scale off handicap:
-- lower handicap = longer + tighter.
alter table public.roster add column if not exists club_distances jsonb;

-- Fill only blank bags (idempotent, won't clobber anything hand-set). Reset for
-- production any time with:  update public.roster set club_distances = null;
update public.roster r
set club_distances = jsonb_build_array(
  jsonb_build_object('club','Dr','carry', greatest(155, (270 - r.handicap*3.0)::int),   'enabled', true),
  jsonb_build_object('club','3W','carry', greatest(145, (245 - r.handicap*2.7)::int),   'enabled', true),
  jsonb_build_object('club','5i','carry', greatest(125, (195 - r.handicap*2.2)::int),   'enabled', true),
  jsonb_build_object('club','7i','carry', greatest(110, (170 - r.handicap*2.0)::int),   'enabled', true),
  jsonb_build_object('club','9i','carry', greatest(90,  (140 - r.handicap*1.6)::int),   'enabled', true),
  jsonb_build_object('club','PW','carry', greatest(78,  (125 - r.handicap*1.4)::int),   'enabled', true),
  jsonb_build_object('club','GW','carry', greatest(65,  (110 - r.handicap*1.3)::int),   'enabled', true),
  jsonb_build_object('club','SW','carry', greatest(52,  (95  - r.handicap*1.2)::int),   'enabled', true)
)
where r.club_distances is null and r.handicap is not null;
