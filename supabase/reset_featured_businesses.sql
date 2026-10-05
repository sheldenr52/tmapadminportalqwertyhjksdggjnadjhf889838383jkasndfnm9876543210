-- Run once in the Supabase SQL Editor after admin_featured_setup.sql.
-- This clears every current selection. Do not rerun after curating features
-- unless you intend to clear those selections again.
BEGIN;

-- Hold the table lock until the guard is restored, so concurrent requests
-- cannot change featured status while the administrative reset runs.
LOCK TABLE public.businesses IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.businesses DISABLE TRIGGER guard_business_featured;
ALTER TABLE public.businesses ALTER COLUMN is_featured SET DEFAULT false;
UPDATE public.businesses SET is_featured = false
WHERE is_featured IS DISTINCT FROM false;
ALTER TABLE public.businesses ENABLE TRIGGER guard_business_featured;

SELECT count(*) AS featured_businesses_remaining
FROM public.businesses WHERE is_featured = true;
COMMIT;
