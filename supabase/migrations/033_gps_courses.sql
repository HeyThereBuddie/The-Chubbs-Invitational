-- GPS course data: stores green/tee pin coordinates per hole
create table if not exists course_gps (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  lat         double precision,
  lng         double precision,
  holes       jsonb not null default '[]'::jsonb,
  created_at  timestamptz default now() not null
);

-- Link tournament to a GPS course setup
alter table tournaments
  add column if not exists course_gps_id uuid references course_gps(id) on delete set null;

-- RLS
alter table course_gps enable row level security;

create policy "course_gps_read" on course_gps
  for select using (auth.role() = 'authenticated');

create policy "course_gps_admin_write" on course_gps
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
