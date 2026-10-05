import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed.' })

  try {
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) return respond(401, { error: 'Please sign in again.' })

    // The privileged key stays on the server. Authorization comes from admin_users,
    // never from user-editable metadata or a user ID supplied in the request body.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: caller, error: authError } = await admin.auth.getUser(token)
    if (authError || !caller.user) return respond(401, { error: 'Please sign in again.' })
    const { data: membership, error: membershipError } = await admin.from('admin_users')
      .select('user_id').eq('user_id', caller.user.id).maybeSingle()
    if (membershipError) return respond(500, { error: 'Unable to verify administrator access.' })
    if (!membership) return respond(403, { error: 'Only administrators can edit users.' })

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return respond(400, { error: 'Invalid JSON request.' }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond(400, { error: 'Invalid request.' })
    const allowed = ['user_id', 'email', 'first_name', 'last_name', 'full_name']
    if (Object.keys(body).some(key => !allowed.includes(key))) return respond(400, { error: 'Unsupported user field.' })
    if (typeof body.user_id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.user_id)) {
      return respond(400, { error: 'A valid user ID is required.' })
    }
    if (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return respond(400, { error: 'Enter a valid email address.' })
    }
    const metadata: Record<string, string | null> = {}
    for (const field of ['first_name', 'last_name', 'full_name']) {
      if (typeof body[field] !== 'string' || (body[field] as string).trim().length > 200) {
        return respond(400, { error: 'Names must be text with at most 200 characters.' })
      }
      metadata[field] = (body[field] as string).trim() || null
    }

    const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(body.user_id)
    if (lookupError || !existing.user) {
      return respond(lookupError?.status === 404 ? 404 : 400, { error: 'Unable to load this user. Refresh the user list and try again.' })
    }
    const email = body.email.trim()
    const emailChanged = email.toLowerCase() !== existing.user.email?.toLowerCase()
    const { data, error } = await admin.auth.admin.updateUserById(body.user_id, {
      // Omit unchanged email to avoid affecting any pending email change.
      ...(emailChanged ? { email } : {}),
      user_metadata: metadata,
    })
    if (error) {
      if (!error.status || error.status >= 500) {
        return respond(500, { error: 'The save could not be confirmed. Refresh the user list before trying again.' })
      }
      return respond(error.status === 422 ? 422 : 400, { error: error.message })
    }
    if (!data.user) return respond(500, { error: 'No updated user was returned. Refresh before trying again.' })
    const user = data.user
    return respond(200, { user: {
      id: user.id, email: user.email,
      first_name: user.user_metadata.first_name ?? null,
      last_name: user.user_metadata.last_name ?? null,
      full_name: user.user_metadata.full_name ?? null,
      created_at: user.created_at, last_sign_in_at: user.last_sign_in_at ?? null,
      confirmed_at: user.confirmed_at ?? null,
    } })
  } catch {
    return respond(500, { error: 'Unable to save user details. Refresh before trying again.' })
  }
}

Deno.serve(handler)
