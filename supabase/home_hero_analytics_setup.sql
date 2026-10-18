-- Run as database owner after home_hero_events tracking and home_hero_slides exist.
-- Adds reporting only; preserves the public website's event ingestion contract.
BEGIN;
ALTER TABLE public.home_hero_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.home_hero_events TO authenticated;
DROP POLICY IF EXISTS home_hero_events_admin_report ON public.home_hero_events;
CREATE POLICY home_hero_events_admin_report ON public.home_hero_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE INDEX IF NOT EXISTS home_hero_events_report_created_idx
  ON public.home_hero_events (created_at);

CREATE OR REPLACE FUNCTION public.admin_home_hero_stats(p_start date, p_end date)
RETURNS TABLE (slide_id uuid, title text, views bigint, unique_viewers bigint,
  clicks bigint, unique_clickers bigint, unique_ctr_percent numeric)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end - p_start > 365 THEN
    RAISE EXCEPTION 'Choose a valid date range of at most 366 days';
  END IF;
  RETURN QUERY
  WITH totals AS (
    SELECT e.slide_id,
      count(*) FILTER (WHERE e.event_type = 'view') AS views,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.event_type = 'view') AS unique_viewers,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.event_type = 'click') AS unique_clickers
    FROM public.home_hero_events e
    WHERE e.created_at >= (p_start::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND e.created_at < ((p_end + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
    GROUP BY e.slide_id
  )
  SELECT coalesce(s.id, t.slide_id), coalesce(s.title, '[Deleted banner]'),
    coalesce(t.views, 0), coalesce(t.unique_viewers, 0),
    coalesce(t.clicks, 0), coalesce(t.unique_clickers, 0),
    round(100.0 * coalesce(t.unique_clickers, 0) / nullif(t.unique_viewers, 0), 2)
  FROM public.home_hero_slides s FULL JOIN totals t ON t.slide_id = s.id
  ORDER BY coalesce(t.unique_viewers, 0) DESC, coalesce(s.id, t.slide_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_home_hero_stats(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_home_hero_stats(date, date) TO authenticated;
COMMIT;
