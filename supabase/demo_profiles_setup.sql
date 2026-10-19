-- Run AFTER admin_setup.sql and admin_business_phase_setup.sql.
-- Preview authorization is a random bearer token, never a business ID.
BEGIN;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS demo_revision uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE IF NOT EXISTS public.business_demo_links (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  demo_revision uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    CHECK (token ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_demo_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_demo_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.business_demo_links TO authenticated;
GRANT ALL ON public.business_demo_links TO service_role;
DROP POLICY IF EXISTS "Admins manage demo links" ON public.business_demo_links;
CREATE POLICY "Admins manage demo links" ON public.business_demo_links
  FOR ALL TO authenticated USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Demo profiles are unlisted" ON public.businesses;
-- Restrictive combines with existing permissive policies, including old public
-- read policies. Owners retain their editor access; public clients filter live.
CREATE POLICY "Demo profiles are unlisted" ON public.businesses AS RESTRICTIVE
  FOR SELECT TO anon, authenticated
  USING (launch_phase = 'live' OR owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- Protect related public metadata (gallery, videos, media/posts, etc.) even
-- if the table previously allowed unconditional public SELECT. Discover by FK.
DO $$
DECLARE rel record;
BEGIN
  FOR rel IN
    SELECT DISTINCT ns.nspname, c.relname, a.attname
    FROM pg_constraint fk
    JOIN pg_class c ON c.oid = fk.conrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = fk.conkey[1]
    WHERE fk.contype = 'f' AND fk.confrelid = 'public.businesses'::regclass
      AND array_length(fk.conkey, 1) = 1 AND ns.nspname = 'public'
      AND fk.confkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.businesses'::regclass AND attname = 'id')
      AND c.relname <> 'business_demo_links'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rel.nspname, rel.relname);
    EXECUTE format('DROP POLICY IF EXISTS "Hide demo business metadata" ON %I.%I', rel.nspname, rel.relname);
    EXECUTE format('CREATE POLICY "Hide demo business metadata" ON %I.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (%I IS NULL OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = %I.%I AND (b.launch_phase = ''live'' OR b.owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))))',
      rel.nspname, rel.relname, rel.attname, rel.relname, rel.attname);
  END LOOP;
END;
$$;

-- Legacy media stores business_id as text without a foreign key, so it is not
-- discovered above. Keep public live photos and owner editing working.
DO $$
BEGIN
  IF to_regclass('public.business_media_and_posts') IS NOT NULL THEN
    ALTER TABLE public.business_media_and_posts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read business media" ON public.business_media_and_posts;
    CREATE POLICY "Public can read business media" ON public.business_media_and_posts
      FOR SELECT TO anon, authenticated USING (true);
    DROP POLICY IF EXISTS "Hide demo business metadata" ON public.business_media_and_posts;
    CREATE POLICY "Hide demo business metadata" ON public.business_media_and_posts AS RESTRICTIVE
      FOR SELECT TO anon, authenticated USING (EXISTS (
        SELECT 1 FROM public.businesses b WHERE b.id::text = business_media_and_posts.business_id::text
        AND (b.launch_phase = 'live' OR b.owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))));
    DROP POLICY IF EXISTS "Owners manage business media" ON public.business_media_and_posts;
    CREATE POLICY "Owners manage business media" ON public.business_media_and_posts
      FOR ALL TO authenticated USING (EXISTS (
        SELECT 1 FROM public.businesses b WHERE b.id::text = business_media_and_posts.business_id::text
        AND (b.owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.businesses b WHERE b.id::text = business_media_and_posts.business_id::text
        AND (b.owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))));
  END IF;
END;
$$;

-- The legacy owner-executed view otherwise bypasses the new row policy.
-- Filter explicitly even for signed-in owners, preserving its columns/grants.
DO $$
DECLARE definition text;
BEGIN
  IF to_regclass('public.business_listings') IS NOT NULL THEN
    SELECT pg_get_viewdef('public.business_listings'::regclass, true) INTO definition;
    IF position('demo_visibility_gate' in definition) = 0 THEN
      EXECUTE 'CREATE OR REPLACE VIEW public.business_listings AS SELECT original_listing.* FROM ('
        || rtrim(definition, E'; \n\r\t')
        || ') original_listing JOIN public.businesses demo_visibility_gate ON demo_visibility_gate.id = original_listing.id WHERE demo_visibility_gate.launch_phase = ''live''';
    END IF;
    ALTER VIEW public.business_listings SET (security_invoker = true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_business_demo_link()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.demo_revision := gen_random_uuid();
  ELSIF OLD.launch_phase IS DISTINCT FROM NEW.launch_phase OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    NEW.demo_revision := gen_random_uuid();
  ELSE
    -- Owners cannot restore a previous revision to resurrect a revoked link.
    NEW.demo_revision := OLD.demo_revision;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_business_demo_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS invalidate_business_demo_link ON public.businesses;
CREATE TRIGGER invalidate_business_demo_link BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_business_demo_link();

-- Service-only snapshot: no browser RPC can bypass RLS. Token, phase and active
-- checks happen in the same database statement. Internal fields are omitted.
CREATE OR REPLACE FUNCTION public.resolve_business_demo(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE b public.businesses; photos jsonb := '[]'; image_paths jsonb := '[]'; promo jsonb := 'null';
BEGIN
  SELECT biz.* INTO b FROM public.businesses biz
    JOIN public.business_demo_links link ON link.business_id = biz.id
    WHERE link.token = p_token AND link.demo_revision = biz.demo_revision
      AND biz.launch_phase = 'demo' AND biz.is_active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF to_regclass('public.business_media_and_posts') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(m.photo_url ORDER BY m.created_at), ''[]''::jsonb) FROM public.business_media_and_posts m WHERE m.business_id::text = $1 AND m.media_type = ''photo'' AND m.photo_url IS NOT NULL'
      INTO photos USING b.id::text;
  END IF;
  -- Older/admin uploads have no media table record. Resolve only files in this
  -- business folder, including those uploaded by an administrator.
  IF photos = '[]'::jsonb AND to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(o.name ORDER BY o.name), ''[]''::jsonb) FROM storage.objects o WHERE o.bucket_id = ''business-images'' AND split_part(o.name, ''/'', 2) = $1 AND o.name ~* ''\.(jpe?g|png|webp|gif|avif)$'''
      INTO image_paths USING b.id::text;
  END IF;
  IF to_regclass('public.profile_videos') IS NOT NULL THEN
    EXECUTE 'SELECT jsonb_build_object(''storage_path'', to_jsonb(v)->>''storage_path'', ''youtube_id'', to_jsonb(v)->>''youtube_id'', ''caption'', to_jsonb(v)->>''caption'') FROM public.profile_videos v WHERE v.business_id = $1 LIMIT 1'
      INTO promo USING b.id;
  END IF;
  RETURN jsonb_build_object('business', jsonb_build_object(
    'name', b.name, 'description', b.description, 'categories', b.categories,
    'address', b.address, 'lat', b.lat, 'lon', b.lon, 'logo_url', b.logo_url,
    'contact_phone', b.contact_phone, 'contact_email', b.contact_email,
    'whatsapp_number', b.whatsapp_number, 'website_url', b.website_url),
    'photos', photos, 'image_paths', image_paths, 'video', promo);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_business_demo(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_business_demo(text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
