# Analytics tracking: main app changes only

Your analytics SQL is already installed. Apply the following changes to the public/main React app that serves `themap.co.za`. All paths below are relative to that app's root. The app must connect to the same Supabase project where you installed `listing_analytics_setup.sql`.

This guide adds event collection for listing views, Call, WhatsApp, photo opens, and listing opens from result cards, map markers, and the featured strip. The existing admin Stats screen reads those events. No further SQL or admin UI changes are included here.

## Step 1: Add the tracking helper to the public/master app

Create `src/lib/listingAnalytics.ts` using the complete contents in **Complete tracking helper** at the end of this guide.

In your existing `src/supabaseClient.ts`, export the URL and public anonymous key constants. Change only their declarations:

```diff
- const supabaseUrl = ...;
- const supabaseAnonKey = ...;
+ export const supabaseUrl = ...;
+ export const supabaseAnonKey = ...;
```

The `...` above represents your existing values or environment-variable expressions; do not paste literal ellipses. Keep the existing `createClient` call. Use the public anon/publishable key, never a service-role/secret key. The helper sends the public key in the `apikey` header and does not attach the logged-in user's token, so analytics ingestion uses the anonymous role even when a visitor is signed in.

No additional frontend dependencies are required.

## Step 2: Track listing views and actions on the details page

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

## Step 3: Track popup views and contact clicks, if used

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

## Step 4: Track which entry point was clicked

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

The comment above means retain the original navigation statements; do not replace the function body with only that comment. Track the event before changing the URL so the helper can correctly exclude demo routes.

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

## Step 5: Build and deploy the main app

From the main app directory, run:

```bash
npm run build
```

Upload the generated `dist` contents to your public website hosting, including the updated `index.html` and its matching `assets` files. Source edits alone will not update the live website.

The additions in this guide passed TypeScript checking in an isolated copy of the main app. The tracking helper also passed tests for duplicate events, visitor identity, privacy opt-out, demo exclusion, blocked storage, and network failures.

## Step 6: Confirm events reach the Stats screen

1. Open the deployed website in a browser with tracking enabled, using a real, active business. Do not use the demo route.
2. Open browser developer tools → Network and filter for `listing_events`.
3. Open a listing from a search-result card, click Call, click WhatsApp, and open a photo.
4. Confirm the POST requests to `/rest/v1/listing_events` succeed, normally with HTTP 201.
5. In the admin app, open that listing's **Stats → Today → Refresh**. You should see one estimated visitor, one listing view, and the actions you clicked. Opening the result card is itself a click.
6. Repeat an action from the same browser: clicks should increase while unique visitors stay at one. Use another browser profile to verify a second unique visitor.

The helper counts one view per listing per full page load, including when React replays effects. Reloading allows another view. Identical clicks within 500 ms are suppressed. Calls and WhatsApp clicks record the button press, not completed conversations. Counts begin when the updated app is deployed; past interactions cannot be reconstructed.

### If the numbers stay at zero

- No POST request: confirm the updated build is deployed and the new handlers execute. The helper skips `/demo`, `returnTo=demo`, and non-UUID business IDs.
- Tracking is also skipped when Do Not Track, Global Privacy Control, or the app's analytics opt-out is enabled.
- A failed POST: check the response message, the Supabase URL/public key, and whether the business is active and publicly readable. The SQL insertion policy requires a visible active listing.
- Successful POST but empty report: confirm both apps use the same Supabase project, open the same business, choose the correct date range, and press Refresh. Report dates use South African time.

## Visitor identity and opt-out

The helper uses a random browser UUID stored in localStorage for up to 90 days. It sends no names, phone numbers, account IDs, IP addresses, or full URLs in event rows. If storage is blocked, the identifier lasts only for the current page load. Unique visitors estimate browsers, not individual people.

If your main app already has an analytics consent control, connect these calls to that choice. Set the opt-out before mounting tracked components until consent is given when your app requires it:

```ts
// Disable subsequent tracking calls:
localStorage.setItem('map.analytics.optout', '1');
// Re-enable:
localStorage.removeItem('map.analytics.optout');
```

Requests are best effort and never block visitor actions. Network failures and blockers can reduce counts. The helper's 200-events-per-page limit and click suppression are client-side safeguards, not server-enforced bot protection.

## Complete tracking helper

Create this file at `src/lib/listingAnalytics.ts`:

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
