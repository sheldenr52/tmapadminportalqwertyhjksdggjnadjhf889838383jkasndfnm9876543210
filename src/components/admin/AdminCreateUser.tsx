import React, { useState } from 'react'
import { supabase, SUPABASE_FUNCTION_URL } from '../../supabase'

interface Props {
  onCreated: () => void
}

export const AdminCreateUser: React.FC<Props> = ({ onCreated }) => {
  const [form, setForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleCreate = async () => {
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setSaving(true)
    setError(null)
    setSuccess(null)

    // Get the current session token to authenticate the Edge Function call
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Not authenticated.')
      setSaving(false)
      return
    }

    const res = await fetch(`${SUPABASE_FUNCTION_URL}/admin-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
      }),
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(json.error || `Request failed (${res.status})`)
    } else {
      setSuccess(`User "${form.email}" created successfully!`)
      setForm({ email: '', password: '', first_name: '', last_name: '' })
      setTimeout(onCreated, 1500)
    }
    setSaving(false)
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-header">
        <h2>👤 Create New User</h2>
      </div>
      <div className="card-body">
        {error   && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
          ⚠️ User creation is handled via a Supabase Edge Function (<code>admin-create-user</code>).
          Make sure the function is deployed before using this form.
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="form-group">
            <label>First Name</label>
            <input
              value={form.first_name}
              onChange={e => set('first_name', e.target.value)}
              placeholder="Jane"
            />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input
              value={form.last_name}
              onChange={e => set('last_name', e.target.value)}
              placeholder="Doe"
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              required
              placeholder="jane@example.com"
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Temporary Password *</label>
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4 }}>
              The user should change this on first login.
            </span>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '1.25rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={saving || !form.email.trim() || form.password.length < 8}
          >
            {saving ? 'Creating…' : '✉️ Create User'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setForm({ email: '', password: '', first_name: '', last_name: '' })}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
