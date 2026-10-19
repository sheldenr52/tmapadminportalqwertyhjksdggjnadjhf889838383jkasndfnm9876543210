-- Run after profile_videos_setup.sql. Preserves existing uploaded videos.
BEGIN;
ALTER TABLE public.profile_videos ADD COLUMN IF NOT EXISTS youtube_id text;
ALTER TABLE public.profile_videos ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.profile_videos DROP CONSTRAINT IF EXISTS profile_videos_source_check;
ALTER TABLE public.profile_videos ADD CONSTRAINT profile_videos_source_check CHECK (
  (storage_path IS NOT NULL AND youtube_id IS NULL)
  OR (storage_path IS NULL AND youtube_id IS NOT NULL AND youtube_id ~ '^[A-Za-z0-9_-]{11}$')
);
COMMIT;
