import React, { useState, useEffect } from 'react'
import { supabase, UserProfile } from '../../supabase'

interface Props {
  onCreated: () => void
}

const CATEGORY_OPTIONS = [
  'Restaurant', 'Cafe', 'Bar', 'Retail', 'Grocery', 'Health & Beauty',
  'Gym & Fitness', 'Medical', 'Dental', 'Pharmacy', 'Auto & Transport',
  'Home Services', 'Education', 'Entertainment', 'Hotels & Accommodation',
  'Professional Services', 'Finance', 'Legal', 'Real Estate', 'Technology',
  'Other',
]

const EMPTY_FORM = {
  owner_id: '',
  name: '',
  description: '',
  contact_email: '',
  contact_phone: '',
  whatsapp_number: '',
  website_url: '',
  address: '',
  lat: '',
  lon: '',
  logo_url: '',
  is_active: true,
  categories: [] as string[],
}

export const AdminBusinessCreate: React.FC<Props> = ({ onCreated }) => {
  const [form, setForm] = useState(EMPTY_FORM)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name')
      .order('email')
      .then(({ data }) => setUsers((data as UserProfile[]) || []))
  }, [])

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const toggleCategory = (cat: string) => {
    set('categories', form.categories.includes(cat)
      ? form.categories.filter(c => c !== cat)
      : [...form.categories, cat]
    )
  }

  const handleCreate = async () => {
    if (!form.owner_id) { setError('Please select an owner.'); return }
    if (!form.name.trim()) { setError('Business name is required.'); return }

    if (logoFile) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(logoFile.type)) {
        setError('Please select a valid image file (JPG, PNG, GIF, or WebP)')
        return
      }
      if (logoFile.size > 2 * 1024 * 1024) {
        setError('Logo file size must be less than 2MB')
        return
      }
    }

    setSaving(true)
    setError(null)

    const payload = {
      owner_id: form.owner_id,
      name: form.name.trim(),
      description: form.description || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      whatsapp_number: form.whatsapp_number || null,
      website_url: form.website_url || null,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lon: form.lon ? parseFloat(form.lon) : null,
      logo_url: null as string | null,
      is_active: form.is_active,
      categories: form.categories,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('businesses')
      .insert([payload])
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    // Upload logo if provided
    if (logoFile && inserted?.id) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const fileExt = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const filePath = `${user.id}/${inserted.id}.${fileExt}`
        await supabase.storage.from('business-logos').remove([filePath])
        const { error: uploadError } = await supabase.storage
          .from('business-logos')
          .upload(filePath, logoFile, { contentType: logoFile.type, upsert: false })
        if (uploadError) {
          setError(`Business created but logo upload failed: ${uploadError.message}`)
          setSaving(false)
          return
        }
        const { data: urlData } = supabase.storage.from('business-logos').getPublicUrl(filePath)
        const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`
        await supabase.from('businesses').update({ logo_url: logoUrl }).eq('id', inserted.id)
      }
    }

    setSuccess(true)
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setTimeout(onCreated, 1200)
    setSaving(false)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>➕ New Business Listing</h2>
      </div>
      <div className="card-body">
        {error   && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">Listing created! Redirecting…</div>}

        {/* Owner */}
        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
          <label>Assign to User *</label>
          <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)} required>
            <option value="">— Select owner —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.email}{u.first_name ? ` — ${u.first_name} ${u.last_name || ''}` : ''}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4 }}>
            The user this listing will belong to.
          </span>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Business Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Acme Coffee" />
          </div>
          <div className="form-group">
            <label>Contact Email</label>
            <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Contact Phone</label>
            <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label>WhatsApp Number</label>
            <input value={form.whatsapp_number} onChange={e => set('whatsapp_number', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Website URL</label>
            <input type="url" value={form.website_url} onChange={e => set('website_url', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Business Logo</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => setLogoFile(e.target.files?.[0] || null)}
                style={{ flex: 1 }}
              />
            </div>
            {logoFile && (
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4, display: 'block' }}>
                {logoFile.name} ({(logoFile.size / 1024).toFixed(0)} KB) — will upload after creation
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4, display: 'block' }}>Max 2 MB · JPG, PNG, GIF, WebP</span>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Latitude</label>
            <input type="number" step="any" value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="-26.2041" />
          </div>
          <div className="form-group">
            <label>Longitude</label>
            <input type="number" step="any" value={form.lon} onChange={e => set('lon', e.target.value)} placeholder="28.0473" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
          </div>
        </div>

        {/* Status */}
        <div style={{ margin: '1rem 0' }}>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
            />
            <div className="toggle-track"><div className="toggle-thumb" /></div>
            <span style={{ fontSize: '0.9rem', color: 'var(--gray-700)' }}>
              {form.is_active ? 'Active on creation' : 'Inactive on creation'}
            </span>
          </label>
        </div>

        {/* Categories */}
        <div className="form-group">
          <label>Categories</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
            {CATEGORY_OPTIONS.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: 999,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: form.categories.includes(cat)
                    ? '2px solid var(--primary)'
                    : '1px solid var(--gray-300)',
                  background: form.categories.includes(cat) ? 'var(--primary-light)' : '#fff',
                  color: form.categories.includes(cat) ? 'var(--primary)' : 'var(--gray-600)',
                  fontWeight: form.categories.includes(cat) ? 600 : 400,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={saving || !form.name.trim() || !form.owner_id}
          >
            {saving ? 'Creating…' : '🏢 Create Listing'}
          </button>
          <button className="btn btn-ghost" onClick={() => setForm(EMPTY_FORM)}>
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
