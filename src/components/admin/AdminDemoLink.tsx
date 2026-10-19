import { useState } from 'react'
import { supabase, Business } from '../../supabase'
import { demoProfileUrl } from '../../demoLinks'

export function AdminDemoLink({ business, disabled }: { business: Business; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function createLink() {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      // Refresh after an owner/admin changed phase or Active status elsewhere.
      const { data: current, error: currentError } = await supabase.from('businesses')
        .select('launch_phase,is_active,demo_revision').eq('id', business.id).single()
      if (currentError) throw currentError
      if (current.launch_phase !== 'demo' || !current.is_active || !current.demo_revision) {
        throw new Error('This business must be active and in Demo. Refresh the listing and try again.')
      }
      const { error: staleError } = await supabase.from('business_demo_links').delete()
        .eq('business_id', business.id).neq('demo_revision', current.demo_revision)
      if (staleError) throw staleError
      // Do not rotate an existing link when copying it again.
      const { error: insertError } = await supabase.from('business_demo_links')
        .upsert({ business_id: business.id, demo_revision: current.demo_revision }, { onConflict: 'business_id', ignoreDuplicates: true })
      if (insertError) throw insertError
      const { data, error: readError } = await supabase.from('business_demo_links')
        .select('token').eq('business_id', business.id).single()
      if (readError) throw readError
      const url = demoProfileUrl(data.token)
      setLink(url)
      // Test the endpoint before presenting a link as ready to send.
      const { error: previewError } = await supabase.functions.invoke('business-demo', { body: { token: data.token } })
      if (previewError) throw new Error('The preview service is not ready. Install and deploy the demo setup before sharing.')
      try {
        await navigator.clipboard.writeText(url)
        setMessage('Demo link copied. Ready to share with your client.')
      } catch { setMessage('Select and copy the link below to share with your client.') }
    } catch (err) {
      setLink('')
      setError((err as { message?: string }).message || 'Could not create demo link.')
    } finally { setBusy(false) }
  }

  async function revokeLink() {
    if (busy) return
    setBusy(true); setError(''); setMessage(''); setLink('')
    try {
      const { error: deleteError } = await supabase.from('business_demo_links').delete().eq('business_id', business.id)
      if (deleteError) throw deleteError
      setMessage('Demo link revoked. Copy demo link will create a new one.')
    } catch (err) { setError((err as { message?: string }).message || 'Could not revoke link.') }
    finally { setBusy(false) }
  }

  if (business.launch_phase !== 'demo') return null
  return <div style={{ minWidth: 210, maxWidth: 300 }}>
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="btn btn-primary btn-sm" disabled={disabled || busy || !business.is_active} onClick={createLink}>
        {busy ? 'Working...' : 'Copy demo link'}
      </button>
      <button className="btn btn-ghost btn-sm" disabled={disabled || busy} onClick={revokeLink}>Revoke link</button>
    </div>
    {!business.is_active && <small>Activate this listing to share a demo.</small>}
    {link && <>
      <input aria-label={`Demo link for ${business.name}`} readOnly value={link} onFocus={e => e.target.select()}
        style={{ width: '100%', marginTop: 8 }} />
      <a href={link} target="_blank" rel="noopener noreferrer">Open preview</a>
    </>}
    {message && <div role="status" style={{ fontSize: 12, marginTop: 6 }}>{message}</div>}
    {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
  </div>
}
