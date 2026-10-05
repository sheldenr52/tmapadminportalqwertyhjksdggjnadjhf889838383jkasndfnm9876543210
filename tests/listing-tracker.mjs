import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import { transform } from 'esbuild'

const source = (await readFile(new URL('../master-project/src/lib/listingAnalytics.ts', import.meta.url), 'utf8'))
  .replace("import { supabaseUrl, supabaseAnonKey } from '../supabaseClient';", "const supabaseUrl = 'https://example.test'; const supabaseAnonKey = 'public-test-key';")
const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2020' })
const business = '00000000-0000-4000-8000-000000000001'
const storage = new Map()
function tracker(options = {}) {
  const requests = []
  const module = { exports: {} }
  const context = {
    module, exports: module.exports, crypto: webcrypto, URLSearchParams,
    navigator: options.navigator || {},
    window: {
      location: options.location || { pathname: '/business', search: '' },
      localStorage: {
        getItem(key) { if (options.blockStorage) throw Error('blocked'); return storage.get(key) || null },
        setItem(key, value) { if (options.blockStorage) throw Error('blocked'); storage.set(key, value) },
      },
    },
    fetch: async (url, init) => {
      requests.push({ url, ...init, body: JSON.parse(init.body) })
      if (options.networkFailure) throw Error('offline')
      return { ok: !options.httpFailure }
    },
  }
  vm.runInNewContext(code, context)
  return { track: module.exports.trackListingEvent, requests }
}
const first = tracker()
assert.equal(await first.track(business, 'view', 'details'), true)
assert.equal(await first.track(business, 'view', 'details'), false) // effect replay
assert.equal(await first.track(business, 'call', 'details'), true)
assert.equal(await first.track(business, 'call', 'details'), false) // accidental rapid double click
assert.equal(await first.track(business, 'whatsapp', 'details'), true)
assert.equal(first.requests.length, 3)
assert.equal(first.requests[0].keepalive, true)
assert.equal(first.requests[0].headers.Prefer, 'return=minimal')
assert.equal(first.requests[0].body.created_at, undefined)
const visitor = first.requests[0].body.visitor_id
assert.ok(first.requests.every(r => r.body.visitor_id === visitor))
assert.equal(new Set(first.requests.map(r => r.body.id)).size, 3)
const reload = tracker()
await reload.track(business, 'view', 'details')
assert.equal(reload.requests[0].body.visitor_id, visitor)
for (const options of [
  { navigator: { doNotTrack: '1' } }, { navigator: { globalPrivacyControl: true } },
  { location: { pathname: '/demo', search: '' } },
  { location: { pathname: '/business', search: '?business=abc&returnTo=demo' } },
]) {
  const client = tracker(options)
  assert.equal(await client.track(business, 'view', 'details'), false)
  assert.equal(client.requests.length, 0)
}
storage.set('map.analytics.optout', '1')
assert.equal(await tracker().track(business, 'view', 'details'), false)
storage.delete('map.analytics.optout')
const blocked = tracker({ blockStorage: true })
assert.equal(await blocked.track(business, 'view', 'details'), true)
await blocked.track(business, 'photo', 'details')
assert.equal(blocked.requests[0].body.visitor_id, blocked.requests[1].body.visitor_id)
assert.equal(await tracker({ networkFailure: true }).track(business, 'view', 'details'), false)
assert.equal(await tracker({ httpFailure: true }).track(business, 'view', 'details'), false)
assert.equal(await tracker().track('demo-123', 'view', 'details'), false)
console.log('Tracker checks passed: view/click deduplication, persistent anonymous IDs, privacy opt-out, demo exclusion, blocked storage, network failure and unload-safe requests.')
