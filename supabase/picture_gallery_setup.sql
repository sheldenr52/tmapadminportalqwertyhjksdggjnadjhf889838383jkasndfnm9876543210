-- Run in the same Supabase project as this admin app, after admin_setup.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.picture_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.picture_gallery ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.picture_gallery TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.picture_gallery TO authenticated;
CREATE POLICY "Public can view gallery pictures" ON public.picture_gallery
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can manage gallery pictures" ON public.picture_gallery
  FOR ALL TO authenticated USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
CREATE INDEX IF NOT EXISTS picture_gallery_business_idx ON public.picture_gallery(business_id);
CREATE INDEX IF NOT EXISTS picture_gallery_created_idx ON public.picture_gallery(created_at DESC);
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-pictures', 'profile-pictures', true, 6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Admins can manage profile picture files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'profile-pictures' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'profile-pictures' AND (SELECT public.is_admin()));
COMMIT;
