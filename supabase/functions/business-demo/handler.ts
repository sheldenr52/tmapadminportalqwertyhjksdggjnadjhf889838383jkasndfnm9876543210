export function createDemoHandler(resolve: (token: string) => Promise<unknown>) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
  }
  const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { headers, status })
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers, status: 204 })
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
    let token: unknown
    try {
      const body = await req.text()
      if (body.length > 512) return reply({ error: 'Invalid request' }, 400)
      token = JSON.parse(body).token
    } catch { return reply({ error: 'Invalid request' }, 400) }
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return reply({ error: 'Preview unavailable' }, 404)
    }
    try {
      const profile = await resolve(token)
      if (!profile) return reply({ error: 'Preview unavailable' }, 404)
      return reply(profile, 200)
    } catch {
      // Never log tokens, request bodies, or private database error details.
      return reply({ error: 'Preview temporarily unavailable' }, 503)
    }
  }
}
