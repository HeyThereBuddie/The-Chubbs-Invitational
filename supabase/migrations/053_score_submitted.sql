-- Shared "submitted" lock for scores.
--
-- Until now a submitted hole locked only on the device that posted it. This adds
-- a persisted submitted_at so a posted hole is locked for BOTH teammates (and
-- survives a reload). A real edit to the score auto-clears it, so the hole must be
-- re-posted and re-approved — matching the approval-freshness rule.

alter table public.scores add column if not exists submitted_at timestamptz;

-- Extend the existing BEFORE UPDATE trigger function. Two changes:
--   1. Only bump updated_at when the actual scoring data changes, so posting /
--      unposting a hole (submitted_at only) never invalidates existing approvals.
--   2. Clear submitted_at whenever score / putts / drive change — a real edit
--      un-posts the hole so the group is re-prompted.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  if new.score is distinct from old.score
     or new.putts is distinct from old.putts
     or new.drive_used_id is distinct from old.drive_used_id then
    new.updated_at = now();
    new.submitted_at = null;
  end if;
  return new;
end;
$$;

-- Trigger binding is unchanged (created in 018_highlights.sql); redefining the
-- function above is enough.
