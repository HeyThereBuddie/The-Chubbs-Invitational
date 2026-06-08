-- ============================================================
-- Contest Photos Storage Bucket
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Create public bucket for contest entry photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contest-photos',
  'contest-photos',
  true,
  10485760,   -- 10 MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload photos
CREATE POLICY "contest-photos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contest-photos');

-- Anyone can read photos (bucket is public)
CREATE POLICY "contest-photos: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'contest-photos');

-- Authenticated users can delete their own uploads
CREATE POLICY "contest-photos: authenticated delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'contest-photos' AND owner = auth.uid());
