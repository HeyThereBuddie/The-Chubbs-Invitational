-- Mandatory one-time setup: new players complete the /welcome wizard before they
-- can use the app. Existing accounts have already been using it, so mark them done.
alter table public.profiles add column if not exists onboarded boolean not null default false;

update public.profiles set onboarded = true where onboarded = false;
