-- Allow authenticated users to update their own Lahey vote
CREATE POLICY "leahey_votes: authenticated update own"
  ON public.leahey_votes FOR UPDATE
  TO authenticated
  USING (voter_id = auth.uid())
  WITH CHECK (voter_id = auth.uid());
