import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

// Execute the actual handler and installed Supabase client against a fake HTTP
// service. No real credentials, accounts, or production writes are used.
const source = await readFile(new URL('../supabase/functions/admin-update-user/index.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replace(/^import .*\n/, ''), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const id = '00000000-0000-4000-8000-000000000002'
const callerId = '00000000-0000-4000-8000-000000000001'
const original = { id, email: 'old@example.test', created_at: '2026-01-01T00:00:00Z',
  user_metadata: { first_name: 'Old', last_name: 'Name', full_name: 'Old Name', avatar_url: 'keep-me' },
  app_metadata: { provider: 'email' } }
let scenario, updates, requests, handler
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const fakeFetch = async (input, options = {}) => {
  const url = new URL(String(input))
  requests.push(url.pathname)
  if (url.pathname === '/auth/v1/user') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer caller-token')
    return scenario === 'expired' ? json({ message: 'Invalid JWT' }, 401) : json({ id: callerId })
  }
  if (url.pathname === '/rest/v1/admin_users') {
    assert.equal(url.searchParams.get('user_id'), `eq.${callerId}`)
    if (scenario === 'membership-error') return json({ message: 'Database unavailable' }, 500)
    return json(scenario === 'non-admin' ? [] : [{ user_id: callerId }])
  }
  assert.equal(url.pathname, `/auth/v1/admin/users/${id}`)
  if (options.method === 'GET') return scenario === 'missing' ? json({ message: 'User not found' }, 404) : json(original)
  assert.equal(options.method, 'PUT')
  const payload = JSON.parse(options.body)
  updates.push(payload)
  if (scenario === 'duplicate') return json({ msg: 'Email already registered', error_code: 'email_exists' }, 422)
  if (scenario === 'network') throw new Error('Connection interrupted')
  return json({ ...original, ...payload, user_metadata: { ...original.user_metadata, ...payload.user_metadata } })
}
vm.runInNewContext(compiled, {
  exports: {}, Request, Response,
  createClient: (url, key, options) => createClient(url, key, { ...options, global: { fetch: fakeFetch } }),
  Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'fake-server-key' }, serve: value => { handler = value } },
})
const valid = { user_id: id, email: ' new@example.test ', first_name: ' Jane ', last_name: ' Doe ', full_name: ' Jane D. ' }
async function call(body = valid, mode = 'admin', authorization = 'Bearer caller-token', method = 'POST') {
  scenario = mode; updates = []; requests = []
  return handler(new Request('https://test.local/admin-update-user', {
    method, headers: authorization ? { Authorization: authorization } : {},
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }))
}
assert.equal((await call(valid, 'admin', '')).status, 401)
assert.equal(requests.length, 0)
assert.equal((await call(valid, 'expired')).status, 401)
assert.equal((await call(valid, 'non-admin')).status, 403)
assert.equal(updates.length, 0)
assert.equal((await call(valid, 'membership-error')).status, 500)
assert.equal((await call(valid, 'admin', '', 'OPTIONS')).status, 200)
assert.equal((await call(valid, 'admin', '', 'GET')).status, 405)
for (const body of ['{', null, [], { ...valid, user_id: 'bad' }, { ...valid, email: 'invalid' },
  { ...valid, first_name: 123 }, { ...valid, full_name: 'x'.repeat(201) },
  { ...valid, app_metadata: { role: 'admin' } }, { ...valid, password: 'injected' }]) {
  assert.equal((await call(body)).status, 400)
  assert.equal(updates.length, 0)
}
console.log('PASS authentication, admin membership, fail-closed access, validation, forbidden fields, CORS and methods')
const saved = await (await call()).json()
assert.equal(saved.user.id, id)
assert.equal(saved.user.email, 'new@example.test')
assert.equal(saved.user.full_name, 'Jane D.')
assert.equal(saved.user.app_metadata, undefined)
assert.deepEqual(updates[0], { email: 'new@example.test', user_metadata: { first_name: 'Jane', last_name: 'Doe', full_name: 'Jane D.' } })
assert.equal((await call({ ...valid, email: original.email, first_name: '', full_name: '' })).status, 200)
assert.equal('email' in updates[0], false)
assert.equal(updates[0].user_metadata.first_name, null)
assert.equal(updates[0].user_metadata.full_name, null)
assert.equal('avatar_url' in updates[0].user_metadata, false, 'Only edited metadata keys are sent for Auth to merge')
assert.equal('email_confirm' in updates[0], false)
assert.equal((await call(valid, 'missing')).status, 404)
assert.equal(updates.length, 0)
assert.equal((await call(valid, 'duplicate')).status, 422)
const originalConsoleError = console.error
try {
  // auth-js logs transport failures before returning them as structured errors.
  console.error = () => {}
  assert.equal((await call(valid, 'network')).status, 500)
} finally { console.error = originalConsoleError }
console.log('PASS edits, whitespace normalization, blank names, unchanged email, limited metadata patch, missing user, duplicate email and network failure')
