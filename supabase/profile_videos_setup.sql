-- Run in this app's Supabase SQL Editor after admin_setup.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.profile_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  business_id uuid UNIQUE REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_videos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profile_videos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profile_videos TO authenticated;
DROP POLICY IF EXISTS "Public can view profile videos" ON public.profile_videos;
CREATE POLICY "Public can view profile videos" ON public.profile_videos
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage profile videos" ON public.profile_videos;
CREATE POLICY "Admins can manage profile videos" ON public.profile_videos
  FOR ALL TO authenticated USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-videos', 'profile-videos', true, 52428800, ARRAY['video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "Admins can manage profile video files" ON storage.objects;
CREATE POLICY "Admins can manage profile video files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'profile-videos' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'profile-videos' AND (SELECT public.is_admin()));
-- Restrictive policy also protects this bucket if an older permissive policy
-- grants authenticated users broad access to storage.objects.
DROP POLICY IF EXISTS "Protect profile video files" ON storage.objects;
CREATE POLICY "Protect profile video files" ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'profile-videos' OR (SELECT public.is_admin()))
  WITH CHECK (bucket_id <> 'profile-videos' OR (SELECT public.is_admin()));
COMMIT;
