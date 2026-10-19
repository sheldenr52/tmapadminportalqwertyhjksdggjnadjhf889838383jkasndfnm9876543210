-- Install after admin_setup.sql. Phase is a label, not a visibility control.
BEGIN;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS launch_phase text NOT NULL
  DEFAULT 'live' CHECK (launch_phase IN ('live', 'demo'));

CREATE OR REPLACE FUNCTION public.guard_business_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.launch_phase = 'live' THEN RETURN NEW; END IF;
  ELSIF NEW.launch_phase IS NOT DISTINCT FROM OLD.launch_phase THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Only administrators can change business phase' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_business_phase() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_business_phase ON public.businesses;
CREATE TRIGGER guard_business_phase BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_phase();
COMMIT;
