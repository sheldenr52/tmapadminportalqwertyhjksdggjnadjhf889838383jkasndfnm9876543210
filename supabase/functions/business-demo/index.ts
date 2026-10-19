import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { createDemoHandler } from './handler.ts'

// Public endpoint: authentication is possession of the random demo token.
// The service key exists only in this server runtime, never in browser code.
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
Deno.serve(createDemoHandler(async token => {
  const { data, error } = await db.rpc('resolve_business_demo', { p_token: token })
  if (error) throw error
  if (data?.image_paths) {
    data.photos = [...(data.photos || []), ...data.image_paths.map((path: string) =>
      db.storage.from('business-images').getPublicUrl(path).data.publicUrl)]
    delete data.image_paths
  }
  return data
}))
