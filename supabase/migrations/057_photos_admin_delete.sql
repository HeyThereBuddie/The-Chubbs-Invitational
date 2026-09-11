-- Let admins delete any photo in Happy's Place; players still delete only their own.
--
-- The original policy allowed deleting only your own row, so an admin tapping delete
-- on someone else's photo was silently rejected by RLS and the photo reappeared.
-- (Selecting/reading and downloading stay open to everyone — unchanged.)

drop policy if exists "photos_delete" on public.photos;
create policy "photos_delete" on public.photos
  for delete
  using (auth.uid() = uploader_id or public.is_admin());
