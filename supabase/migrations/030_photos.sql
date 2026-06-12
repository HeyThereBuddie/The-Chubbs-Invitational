-- Happy's Place photo wall
create table if not exists public.photos (
  id            uuid         primary key default gen_random_uuid(),
  uploader_id   uuid         not null references public.profiles(id) on delete cascade,
  photo_url     text         not null,
  caption       text,
  tournament_id uuid,
  created_at    timestamptz  not null default now()
);

alter table public.photos enable row level security;

create policy "photos_select" on public.photos for select using (true);
create policy "photos_insert" on public.photos for insert with check (auth.uid() = uploader_id);
create policy "photos_delete" on public.photos for delete using (auth.uid() = uploader_id);

create index if not exists photos_tournament_id_idx on public.photos (tournament_id, created_at desc);
