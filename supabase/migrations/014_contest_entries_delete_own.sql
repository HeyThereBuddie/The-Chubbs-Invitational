-- Allow players to delete their own contest entries (needed for replace-on-resubmit)
CREATE POLICY "contest_entries: authenticated delete own"
  ON public.contest_entries FOR DELETE
  TO authenticated
  USING (player_id = auth.uid());
