-- Install after admin_setup.sql. Existing businesses start with Featured off.
BEGIN;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Owners may still edit listings through existing RLS, but only admins can
-- change the featured flag (including when inserting a listing).
CREATE OR REPLACE FUNCTION public.guard_business_featured()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_featured THEN RETURN NEW; END IF;
  ELSIF NEW.is_featured IS NOT DISTINCT FROM OLD.is_featured THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Only administrators can change featured status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_business_featured() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_business_featured ON public.businesses;
CREATE TRIGGER guard_business_featured
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_featured();

COMMIT;
