-- Make score-approval freshness reliable regardless of players' phone clocks.
--
-- Approval validity is decided by comparing score_approvals.updated_at against
-- scores.updated_at. Scores are stamped server-side (trigger / column default),
-- but approvals were being stamped with the approving phone's clock. A skewed
-- phone clock could make a fresh approval look "stale", so the other team never
-- settles and gets stuck. Force approvals to server time so both sides of the
-- comparison use the same clock.

create or replace function public.set_score_approval_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists score_approvals_set_updated_at on public.score_approvals;
create trigger score_approvals_set_updated_at
  before insert or update on public.score_approvals
  for each row execute function public.set_score_approval_updated_at();
