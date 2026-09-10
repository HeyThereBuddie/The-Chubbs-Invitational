-- Let a manually-set team name override the auto-generated "LastA & LastB" label.
--
-- Boards compute the label live from current players so they stay consistent and
-- self-heal after swaps. This flag marks names an organizer typed by hand (via
-- Rename) so those are shown verbatim instead of being recomputed. Auto actions
-- (create / swap / reset-to-players) clear it; Rename sets it.

alter table public.teams add column if not exists name_custom boolean not null default false;
