import React, { useEffect, useRef, useState } from 'react'
import { supabase, SUPABASE_FUNCTION_URL, UserProfile } from '../../supabase'

interface Props {
  user: UserProfile
  onClose: () => void
  onSaved: (user: UserProfile) => void
}

export const AdminUserEdit: React.FC<Props> = ({ user, onClose, onSaved }) => {
  const [form, setForm] = useState({
    email: user.email || '', first_name: user.first_name || '',
    last_name: user.last_name || '', full_name: user.full_name || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { dialog.current?.close(); previous?.focus() }
  }, [])
  const changed = (Object.keys(form) as (keyof typeof form)[]).some(key => form[key].trim() !== (user[key] || ''))
  const emailChanged = form.email.trim().toLowerCase() !== (user.email || '').toLowerCase()

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (inFlight.current || !changed) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error('Please sign in again before saving.')
      const response = await fetch(`${SUPABASE_FUNCTION_URL}/admin-update-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: user.id, ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `Unable to save user details (${response.status}).`)
      if (result.user?.id !== user.id) throw new Error('The save could not be confirmed. Refresh the user list before trying again.')
      onSaved(result.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect. Please try again.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} className="modal user-edit-dialog" aria-labelledby="user-edit-title"
      onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }}>
      <form onSubmit={save}>
        <div className="modal-header">
          <h2 id="user-edit-title">Edit user details</h2>
          <button type="button" className="close-btn" aria-label="Close edit user" disabled={saving} onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '1rem', overflowWrap: 'anywhere' }}>{user.email}</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="edit-user-email">Email *</label>
              <input id="edit-user-email" type="email" required maxLength={254} autoFocus disabled={saving}
                value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            {(['first_name', 'last_name', 'full_name'] as const).map(field => (
              <div className="form-group" key={field}>
                <label htmlFor={`edit-user-${field}`}>{({ first_name: 'First name', last_name: 'Last name', full_name: 'Full name / display name' })[field]}</label>
                <input id={`edit-user-${field}`} maxLength={200} disabled={saving}
                  value={form[field]} onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={saving || (!form.first_name.trim() && !form.last_name.trim())}
            onClick={() => setForm(prev => ({ ...prev, full_name: [prev.first_name.trim(), prev.last_name.trim()].filter(Boolean).join(' ') }))}>
            Use first and last name as full name
          </button>
          {emailChanged && <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
            Saving changes the user's sign-in email immediately. Check that the new address is correct.
          </div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !changed || !form.email.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
