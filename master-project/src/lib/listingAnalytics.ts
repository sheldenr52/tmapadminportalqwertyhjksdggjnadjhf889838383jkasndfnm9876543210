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
