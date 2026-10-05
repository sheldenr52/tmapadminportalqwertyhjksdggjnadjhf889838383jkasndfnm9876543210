-- Run after admin_setup.sql in the Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.listing_events (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN
    ('view', 'listing_open', 'call', 'whatsapp', 'photo')),
  source text NOT NULL CHECK (source IN
    ('details', 'popup', 'results', 'featured', 'map')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_events_business_created_idx
  ON public.listing_events (business_id, created_at);
ALTER TABLE public.listing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_events FROM PUBLIC, anon, authenticated;
-- Visitors can submit events but cannot set timestamps or read/change events.
GRANT INSERT (id, business_id, visitor_id, event_type, source)
  ON public.listing_events TO anon, authenticated;
GRANT SELECT ON public.listing_events TO authenticated;

DROP POLICY IF EXISTS listing_events_insert ON public.listing_events;
CREATE POLICY listing_events_insert ON public.listing_events
  FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.is_active = true)
  );
DROP POLICY IF EXISTS listing_events_admin_read ON public.listing_events;
CREATE POLICY listing_events_admin_read ON public.listing_events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.admin_listing_stats(
  p_business_id uuid, p_start date, p_end date
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_business_id IS NULL OR p_start IS NULL OR p_end IS NULL
    OR p_end < p_start OR p_end - p_start > 365 THEN
    RAISE EXCEPTION 'Choose a valid date range of at most 366 days';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Listing not found or not accessible';
  END IF;

  WITH events AS MATERIALIZED (
    SELECT visitor_id, event_type, source,
      (created_at AT TIME ZONE 'Africa/Johannesburg')::date AS day
    FROM public.listing_events
    WHERE business_id = p_business_id
      AND created_at >= (p_start::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND created_at < ((p_end + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
  ), totals AS (
    SELECT count(*) FILTER (WHERE event_type = 'view') AS views,
      count(DISTINCT visitor_id) AS unique_visitors,
      count(DISTINCT visitor_id) FILTER (WHERE event_type <> 'view') AS interacting_visitors,
      count(*) FILTER (WHERE event_type <> 'view') AS clicks
    FROM events
  ), actions AS (
    SELECT event_type, count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
    FROM events WHERE event_type <> 'view' GROUP BY event_type
  ), sources AS (
    SELECT source, count(*) AS opens, count(DISTINCT visitor_id) AS visitors
    FROM events WHERE event_type = 'listing_open' GROUP BY source
  ), daily AS (
    SELECT day, count(*) FILTER (WHERE event_type = 'view') AS views,
      count(*) FILTER (WHERE event_type <> 'view') AS clicks,
      count(DISTINCT visitor_id) AS visitors
    FROM events GROUP BY day
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'actions', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.event_type) FROM actions a), '[]'::jsonb),
    'sources', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.source) FROM sources s), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day DESC) FROM daily d), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_listing_stats(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listing_stats(uuid, date, date) TO authenticated;
COMMIT;
