# Per-listing analytics: master project implementation

## What this adds

An admin can open **All Listings → Stats** beside any business and choose Today, Last 7 days, Last 30 days, or a custom range of up to 366 days. Reports show:

| Metric | Meaning |
| --- | --- |
| Listing views | A business details page or popup was opened; counted once per listing per browser page load |
| Estimated unique visitors | Distinct random browser IDs with any recorded event in the selected range |
| Visitors who clicked | Distinct browser IDs that clicked at least one tracked action |
| Total clicks | Listing opens, Call, WhatsApp, and photo-open clicks combined |
| Action breakdown | Clicks and distinct visitors for each action |
| Entry points | Listing-open clicks from the featured strip, search-result cards, and map markers |
| Daily activity | Views, clicks, and unique visitors for each day with recorded activity |

Dates include the full start and end days in `Africa/Johannesburg` time. Unique visitors across days, actions, or entry points overlap; do not sum them to calculate the overall unique count. A direct URL visit counts as a view without a listing-open click. Entry-point reporting counts the clicked entry point, not marketing/referral attribution for subsequent actions.

## Current implementation status

- Implemented in the admin workspace: Stats modal, Stats button, SQL setup, tracking helper, and automated tests.
- The master/public website tracking integration is supplied below for you to apply to your original project. It has **not been deployed**.
- The SQL was executed and verified in isolated local PostgreSQL. **No production database table has been created:** the connected Supabase account denied access to project `bouxpfsfhetcqcrqflfk`.
- Run the SQL below in that project's Supabase SQL Editor, or reconnect an account with access before requesting remote installation.
- The existing owner's dashboard example numbers are separate from this feature. This implementation adds real reports to the admin All Listings screen.

## Step 1: Install the database setup

Run all of **Appendix A** in the Supabase SQL Editor after your existing `admin_setup.sql`.

Prerequisites are `public.businesses` with a UUID `id` and boolean `is_active`, `public.is_admin()`, and your existing listing read policies. The current project uses this shape; verify it against your original database before installing. Visitors need the existing ability to SELECT active listings, because the event insertion policy checks that the business is active and visible to that visitor.

The setup creates:

- `public.listing_events`: one row per recorded event, linked to the business. Deleting a business also deletes its analytics.
- An index on `(business_id, created_at)` for date-range reports.
- Row-level security and explicit permissions: visitors can insert allowed fields only; only admins can read events. No client can update or delete events. Visitors cannot submit a timestamp; the database supplies it.
- `public.admin_listing_stats(uuid, date, date)`: an admin-only report function using the caller's permissions and RLS, without elevated privileges.

The setup can be rerun without clearing existing analytics. This feature does not depend on `is_featured` or the featured reset script.

## Step 2: Add the tracking helper to the public/master app

Create `src/lib/listingAnalytics.ts` using the complete contents in **Appendix B**.

In your existing `src/supabaseClient.ts`, export the URL and public anonymous key constants. Change only their declarations:

```diff
- const supabaseUrl = ...;
- const supabaseAnonKey = ...;
+ export const supabaseUrl = ...;
+ export const supabaseAnonKey = ...;
```

The `...` above represents your existing values or environment-variable expressions; do not paste literal ellipses. Keep the existing `createClient` call. Use the public anon/publishable key, never a service-role/secret key. The helper sends the public key in the `apikey` header and does not attach the logged-in user's token, so analytics ingestion uses the anonymous role even when a visitor is signed in.

No additional frontend dependencies are required.

## Step 3: Track listing views and actions on the details page

File: `src/components/BusinessDetailsPage.tsx`.

Add:

```tsx
import { trackListingEvent } from '../lib/listingAnalytics';
```

Inside the component, after `selectedBusiness` is obtained from context and **before any conditional return**, add this effect. `useEffect` is already imported:

```tsx
useEffect(() => {
  if (selectedBusiness?.id) {
    void trackListingEvent(selectedBusiness.id, 'view', 'details');
  }
}, [selectedBusiness?.id]);
```

Replace the existing `handleCall` and `handleWhatsApp` handlers with:

```tsx
const handleCall = () => {
  if (selectedBusiness?.phone) {
    void trackListingEvent(selectedBusiness.id, 'call', 'details');
    window.location.href = `tel:${selectedBusiness.phone}`;
  }
};

const handleWhatsApp = () => {
  if (selectedBusiness?.whatsapp) {
    void trackListingEvent(selectedBusiness.id, 'whatsapp', 'details');
    const businessName = selectedBusiness.name[currentLanguage] || selectedBusiness.name.en;
    const url = generateWhatsAppURL(selectedBusiness.whatsapp, businessName);
    window.open(url, '_blank');
  }
};
```

Replace the one-line `openLightbox` handler with:

```tsx
const openLightbox = (index: number) => {
  if (selectedBusiness?.id) {
    void trackListingEvent(selectedBusiness.id, 'photo', 'details');
  }
  setLightboxIndex(index);
};
```

This counts clicking a photo to open the lightbox. It does not count automatic image loads or using next/previous arrows inside the lightbox. Keep the existing button and photo `onClick` handlers pointing to these functions. Do not add another tracking call to those JSX handlers, or clicks will be recorded twice.

Do not `await` tracking before opening WhatsApp or the phone dialler. The helper starts a small `fetch` request with `keepalive: true`, and a tracking failure must not prevent the visitor's action.

## Step 4: Track popup views and contact clicks, if used

File: `src/components/BusinessPopup.tsx`.

Add the same `trackListingEvent` import. Add the following inside the component before conditional returns:

```tsx
useEffect(() => {
  if (selectedBusiness?.id) {
    void trackListingEvent(selectedBusiness.id, 'view', 'popup');
  }
}, [selectedBusiness?.id]);
```

In `handleCall`, immediately before `window.location.href = ...`, add:

```tsx
void trackListingEvent(selectedBusiness.id, 'call', 'popup');
```

In `handleWhatsApp`, inside the existing `if (selectedBusiness?.whatsapp)` block and before opening the URL, add:

```tsx
void trackListingEvent(selectedBusiness.id, 'whatsapp', 'popup');
```

The inspected app routes to BusinessDetailsPage; BusinessPopup is an older alternative. Instrument it if your master project still renders it. Do not render an otherwise hidden popup just to record events. The shared helper prevents two view events for the same business in one page load even if both view effects run.

## Step 5: Track which entry point was clicked

Add this import to each of the following three files:

```tsx
import { trackListingEvent } from '../lib/listingAnalytics';
```

### Search-result cards

File: `src/components/BusinessCard.tsx`.

Replace the root card's `onClick={onClick}` with:

```tsx
onClick={() => {
  void trackListingEvent(business.id, 'listing_open', 'results');
  onClick();
}}
```

Keep the existing `className="business-card"` and other props. This records a click, not merely rendering a card in search results.

### Featured strip

File: `src/components/FeaturedCarousel.tsx`.

Add the event call as the first statement of your existing navigation function:

```tsx
const navigateToBusiness = (businessId: string) => {
  void trackListingEvent(businessId, 'listing_open', 'featured');
  // Keep the existing URL construction, history.pushState and popstate dispatch.
};
```

The comment above means retain the original navigation statements; do not replace the function body with only that comment. Track the event before changing the URL so the helper can correctly exclude demo routes. Keep the earlier `.eq('is_featured', true)` change in the carousel query.

### Map markers

File: `src/components/MapComponent.tsx`.

Inside the existing marker click listener, insert the tracking call before navigation:

```tsx
markerEl.addEventListener('click', () => {
  void trackListingEvent(business.id, 'listing_open', 'map');
  // Keep all existing navigation and context dispatch statements here.
});
```

Again, keep the original listener body after the new call. Merely displaying a marker does not count as an interaction.

## Step 6: Include the admin Stats view

These changes are already applied in this admin workspace. If copying to another original admin project:

1. Create `src/components/admin/AdminListingStats.tsx` from **Appendix C**.
2. In `src/components/admin/AdminBusinessList.tsx`, add:

```tsx
import { AdminListingStats } from './AdminListingStats'
```

3. Add this state inside `AdminBusinessList` alongside the existing state:

```tsx
const [statsTarget, setStatsTarget] = useState<Business | null>(null)
```

4. Inside each listing row's existing Actions cell, alongside Edit, add:

```tsx
<button className="btn btn-ghost btn-sm" onClick={() => setStatsTarget(biz)}>Stats</button>
```

5. Near the existing edit-modal rendering, inside the returned fragment, add:

```tsx
{statsTarget && (
  <AdminListingStats
    key={statsTarget.id}
    business={statsTarget}
    onClose={() => setStatsTarget(null)}
  />
)}
```

The component uses the existing admin Supabase client and modal/table/card styles. No CSS, Business type, or subscription changes are required for analytics. It does not display made-up figures on errors: missing SQL or permission failures produce an error message, while a successful report with no events shows zeros.

## Step 7: Build, deploy and verify the complete flow

1. Install Appendix A in the correct database.
2. Apply Steps 2–5 to the master public website and Step 6 to the admin project if needed.
3. Run `npm run build` in both app directories and deploy each generated `dist` to its correct hosting location. Both apps must use the same Supabase project.
4. Open the public website in a browser with tracking enabled. Choose an active real business; demo routes and non-UUID fixture listings are intentionally excluded.
5. Open that listing from search results, click Call, click WhatsApp, and open a photo. Keep your normal navigation handlers working.
6. In browser developer tools, check that POST requests to `/rest/v1/listing_events` receive a successful response (normally 201). The request body should have only `id`, `business_id`, `visitor_id`, `event_type`, and `source`.
7. In the admin, open that business's Stats, select Today, and click Refresh. Expect one view, one estimated visitor, and the actions you actually clicked. The listing-open click is included in Total clicks.
8. Click another action from the same browser. Click totals should increase while unique visitors remain one. Repeated identical clicks within 500 ms are intentionally suppressed.
9. Use another browser profile with tracking enabled and repeat. Unique visitors should increase. A private browser window is a separate visitor only if its storage is separate.
10. Verify another business's report is unaffected. Open a listing through the featured strip or map to verify entry-point counts.

The helper returns `Promise<boolean>` for diagnostics. An explicit test such as `await trackListingEvent(realBusinessId, 'view', 'details')` should return true on the first recorded view; false means skipped or failed. Normal UI handlers should use `void`, as shown above.

## Privacy and accuracy

The helper stores a random visitor UUID in localStorage for up to 90 days, with an in-memory fallback if storage is blocked. It does not attach account IDs, names, email addresses, phone numbers, IP addresses, full page URLs, or user-agent strings to event rows. Shared browsers can represent multiple people; different devices, cleared storage, or identifier expiry can count one person more than once.

The helper respects browser Do Not Track and Global Privacy Control and supports a site opt-out:

```ts
localStorage.setItem('map.analytics.optout', '1'); // stop subsequent tracking calls
localStorage.removeItem('map.analytics.visitor.v1'); // remove the persisted visitor identifier
```

To re-enable, remove `map.analytics.optout`. If your site already requires an explicit analytics consent choice, gate calls to the helper on that choice or set the opt-out before mounting tracked components until consent is given. This helper does not create a consent interface.

Only admins can read reports or raw event rows. Existing event data is retained until deliberately deleted; identifier expiry does not delete database history. No automated retention job is installed.

These are best-effort browser event counts. Blockers, disabled tracking, failed networks, and browser shutdown can lose events. Reloading allows a new listing view; SPA revisits to the same listing within one page load do not add another view. The helper caps submissions at 200 per page load and suppresses rapid duplicate clicks. These are client-side safeguards, **not server-enforced bot protection**: the public ingestion endpoint can receive fabricated submissions. The counts should not be treated as audited billing or completed leads. Calls and WhatsApp clicks do not prove completed conversations. There is no historical backfill.

## Local verification supplied with this implementation

```powershell
node tests/listing-analytics.mjs
node tests/listing-tracker.mjs
npm.cmd run build
```

The database test requires the existing isolated-test dependency at `.verification/node_modules/@electric-sql/pglite`. If setting up this admin project elsewhere, install it with:

```powershell
npm.cmd install --prefix .verification --no-save --package-lock=false @electric-sql/pglite@0.5.8
```

Database tests cover permissions, invalid/inactive/nonexistent listings, server timestamps, unique visitor aggregation, listing isolation, empty ranges, and South African midnight boundaries. Helper tests cover repeated views/clicks, browser identity persistence, opt-out, demo exclusion, blocked storage, and failed requests. The admin production build passed. The exact integration additions above also passed TypeScript checking in an isolated copy of the public website source. They do not replace the live browser integration checks after deployment.

Database access rules follow [Supabase's RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).


## Appendix A: supabase/listing_analytics_setup.sql

```sql
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

```

## Appendix B: src/lib/listingAnalytics.ts (public website)

```ts
import { supabaseUrl, supabaseAnonKey } from '../supabaseClient';

export type ListingEvent = 'view' | 'listing_open' | 'call' | 'whatsapp' | 'photo';
export type ListingSource = 'details' | 'popup' | 'results' | 'featured' | 'map';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const visitorKey = 'map.analytics.visitor.v1';
const visitorLifetime = 90 * 24 * 60 * 60 * 1000;
let memoryVisitor: string | undefined;
const viewed = new Set<string>();
const lastClick = new Map<string, number>();
let sent = 0;

function visitorId(): string {
  if (memoryVisitor) return memoryVisitor;
  try {
    const saved = JSON.parse(window.localStorage.getItem(visitorKey) || 'null');
    if (saved && typeof saved.id === 'string' && uuidPattern.test(saved.id)
      && typeof saved.expires === 'number' && saved.expires > Date.now()) {
      memoryVisitor = saved.id;
      return saved.id;
    }
  } catch { /* Storage can be blocked; use an in-memory identifier instead. */ }
  const id = crypto.randomUUID();
  memoryVisitor = id;
  try {
    window.localStorage.setItem(visitorKey, JSON.stringify({ id, expires: Date.now() + visitorLifetime }));
  } catch { /* Continue with an identifier lasting for this page load. */ }
  return id;
}

/** Best effort. Never await this before opening a link, dialler, or popup. */
export async function trackListingEvent(
  businessId: string, event: ListingEvent, source: ListingSource,
): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !uuidPattern.test(businessId)) return false;
    if (window.location.pathname === '/demo'
      || new URLSearchParams(window.location.search).get('returnTo') === 'demo') return false;
    if (navigator.doNotTrack === '1'
      || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
    try {
      if (window.localStorage.getItem('map.analytics.optout') === '1') return false;
    } catch { /* A blocked storage API must not break the business action. */ }
    if (sent >= 200) return false;
    // Once per listing per page load, including React StrictMode effect replay.
    if (event === 'view' && viewed.has(businessId)) return false;
    const clickKey = `${businessId}:${event}:${source}`;
    if (event !== 'view' && Date.now() - (lastClick.get(clickKey) ?? 0) < 500) return false;
    const row = {
      id: crypto.randomUUID(), business_id: businessId,
      visitor_id: visitorId(), event_type: event, source,
    };
    if (event === 'view') viewed.add(businessId);
    else lastClick.set(clickKey, Date.now());
    sent += 1;
    const response = await fetch(`${supabaseUrl}/rest/v1/listing_events`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      keepalive: true,
      credentials: 'omit',
    });
    return response.ok;
  } catch {
    return false;
  }
}

```

## Appendix C: src/components/admin/AdminListingStats.tsx (admin app)

```tsx
import React, { useEffect, useState } from 'react'
import { supabase, Business } from '../../supabase'

interface Stats {
  totals: { views: number; unique_visitors: number; interacting_visitors: number; clicks: number }
  actions: Array<{ event_type: string; clicks: number; visitors: number }>
  sources: Array<{ source: string; opens: number; visitors: number }>
  daily: Array<{ day: string; views: number; clicks: number; visitors: number }>
}

const actionLabels: Record<string, string> = {
  listing_open: 'Open listing', call: 'Call', whatsapp: 'WhatsApp', photo: 'Open photo',
}
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const daysAgo = (days: number) => {
  const date = new Date(`${today()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export const AdminListingStats: React.FC<{ business: Business; onClose: () => void }> = ({ business, onClose }) => {
  const [start, setStart] = useState(() => daysAgo(29))
  const [end, setEnd] = useState(today)
  const [refresh, setRefresh] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStats(null)
    setError(null)
    if (!start || !end || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 365) {
      setError('Choose a valid date range of at most 366 days.')
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const { data, error: queryError } = await supabase.rpc('admin_listing_stats', {
          p_business_id: business.id, p_start: start, p_end: end,
        })
        if (queryError) throw queryError
        if (!cancelled) setStats(data as Stats)
      } catch (err) {
        if (!cancelled) setError((err as { message?: string })?.message || 'Could not load statistics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [business.id, start, end, refresh])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="listing-stats-title">
        <div className="modal-header">
          <h2 id="listing-stats-title">Statistics: {business.name}</h2>
          <button className="close-btn" aria-label="Close statistics" onClick={onClose} autoFocus>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group"><label htmlFor="stats-start">From</label><input id="stats-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="form-group"><label htmlFor="stats-end">Through</label><input id="stats-end" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1rem 0' }}>
            {[1, 7, 30].map(days => <button key={days} className="btn btn-ghost btn-sm" onClick={() => { setStart(daysAgo(days - 1)); setEnd(today()) }}>{days === 1 ? 'Today' : `Last ${days} days`}</button>)}
            <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh</button>
          </div>
          <p>Dates include the full day in South African time. Tracking starts when the public website integration is deployed.</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {loading && <p role="status">Loading statistics...</p>}
          {stats && <>
            <div className="stats-grid" style={{ marginTop: '1rem' }}>
              {[
                ['Listing views', stats.totals.views], ['Estimated unique visitors', stats.totals.unique_visitors],
                ['Visitors who clicked', stats.totals.interacting_visitors], ['Total clicks', stats.totals.clicks],
              ].map(([label, value]) => <div className="stat-card" key={label}><div className="label">{label}</div><div className="value">{Number(value).toLocaleString()}</div></div>)}
            </div>
            {stats.totals.unique_visitors === 0 && <p>No recorded interactions in this period. If tracking has not been installed yet, these totals will remain zero.</p>}
            <h3>What visitors clicked</h3>
            <div className="table-wrapper"><table><thead><tr><th>Action</th><th>Clicks</th><th>Unique visitors</th></tr></thead><tbody>
              {Object.entries(actionLabels).map(([event, label]) => {
                const action = stats.actions.find(a => a.event_type === event)
                return <tr key={event}><td>{label}</td><td>{action?.clicks ?? 0}</td><td>{action?.visitors ?? 0}</td></tr>
              })}
            </tbody></table></div>
            <h3>Where listings were opened</h3>
            <div className="table-wrapper"><table><thead><tr><th>Entry point</th><th>Opens</th><th>Unique visitors</th></tr></thead><tbody>
              {['featured', 'results', 'map'].map(source => {
                const entry = stats.sources.find(s => s.source === source)
                return <tr key={source}><td>{source === 'featured' ? 'Featured strip' : source === 'results' ? 'Search results' : 'Map'}</td><td>{entry?.opens ?? 0}</td><td>{entry?.visitors ?? 0}</td></tr>
              })}
            </tbody></table></div>
            <h3>Daily activity</h3>
            <div className="table-wrapper"><table><thead><tr><th>Date</th><th>Views</th><th>Clicks</th><th>Unique visitors</th></tr></thead><tbody>
              {stats.daily.map(day => <tr key={day.day}><td>{day.day}</td><td>{day.views}</td><td>{day.clicks}</td><td>{day.visitors}</td></tr>)}
            </tbody></table></div>
            <p style={{ fontSize: '0.8rem', marginTop: '1rem' }}>Unique visitors estimate browsers, not people. Clicks include opening a listing. Call and WhatsApp clicks do not confirm completed conversations. Daily and action-level unique counts can overlap; do not add them together.</p>
          </>}
        </div>
      </div>
    </div>
  )
}

```
