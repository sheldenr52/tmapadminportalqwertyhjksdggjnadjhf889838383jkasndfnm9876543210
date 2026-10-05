import React, { useState, useEffect } from 'react'
import { supabase, Business, UserProfile } from '../../supabase'

interface Props {
  business: Business
  onClose: () => void
  onSaved: (updated: Business) => void
}

const CATEGORY_OPTIONS = [
  'Restaurant', 'Cafe', 'Bar', 'Retail', 'Grocery', 'Health & Beauty',
  'Gym & Fitness', 'Medical', 'Dental', 'Pharmacy', 'Auto & Transport',
  'Home Services', 'Education', 'Entertainment', 'Hotels & Accommodation',
  'Professional Services', 'Finance', 'Legal', 'Real Estate', 'Technology',
  'Other',
]

export const AdminBusinessEdit: React.FC<Props> = ({ business, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: business.name || '',
    description: business.description || '',
    contact_email: business.contact_email || '',
    contact_phone: business.contact_phone || '',
    whatsapp_number: business.whatsapp_number || '',
    website_url: business.website_url || '',
    address: business.address || '',
    lat: business.lat?.toString() || '',
    lon: business.lon?.toString() || '',
    logo_url: business.logo_url || '',
    is_active: business.is_active,
    categories: business.categories || [] as string[],
    owner_id: business.owner_id || '',
  })

  const [users, setUsers] = useState<UserProfile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [mediaItems, setMediaItems] = useState<Array<{ path: string; url: string }>>([])
  const [mediaLoading, setMediaLoading] = useState(false)

  // Load users for the owner reassignment dropdown
  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name')
      .order('email')
      .then(({ data }) => setUsers((data as UserProfile[]) || []))
  }, [])

  useEffect(() => { loadMedia() }, [])

  const loadMedia = async () => {
    setMediaLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMediaLoading(false); return }
    const { data } = await supabase.storage
      .from('business-images')
      .list(`${user.id}/${business.id}`)
    if (data) {
      const items = data.map(file => {
        const path = `${user.id}/${business.id}/${file.name}`
        const { data: urlData } = supabase.storage.from('business-images').getPublicUrl(path)
        return { path, url: urlData.publicUrl }
      })
      setMediaItems(items)
    }
    setMediaLoading(false)
  }

  const handleLogoUpload = async () => {
    if (!logoFile) return
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(logoFile.type)) {
      setError('Please select a valid image file (JPG, PNG, GIF, or WebP)')
      return
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      setError('Logo file size must be less than 2MB')
      return
    }
    setLogoUploading(true)
    setError(null)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { setError('You must be signed in to upload'); setLogoUploading(false); return }
    const fileExt = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${user.id}/${business.id}.${fileExt}`
    await supabase.storage.from('business-logos').remove([filePath])
    const { error: uploadError } = await supabase.storage
      .from('business-logos')
      .upload(filePath, logoFile, { contentType: logoFile.type, upsert: false })
    if (uploadError) { setError(`Logo upload failed: ${uploadError.message}`); setLogoUploading(false); return }
    const { data: urlData } = supabase.storage.from('business-logos').getPublicUrl(filePath)
    const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`
    const { error: updateError } = await supabase
      .from('businesses').update({ logo_url: logoUrl }).eq('id', business.id)
    if (updateError) { setError(`Failed to save logo URL: ${updateError.message}`); setLogoUploading(false); return }
    set('logo_url', logoUrl)
    setLogoFile(null)
    setLogoUploading(false)
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) { setError('Please select a valid image file (JPG, PNG, GIF, or WebP)'); return }
    if (file.size > 5 * 1024 * 1024) { setError('File size must be less than 5MB'); return }
    setMediaUploading(true)
    setError(null)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { setError('You must be signed in to upload'); setMediaUploading(false); return }
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`
    const filePath = `${user.id}/${business.id}/${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('business-images')
      .upload(filePath, file, { contentType: file.type, upsert: false })
    if (uploadError) { setError(`Media upload failed: ${uploadError.message}`); setMediaUploading(false); return }
    const { data: urlData } = supabase.storage.from('business-images').getPublicUrl(filePath)
    setMediaItems(prev => [...prev, { path: filePath, url: urlData.publicUrl }])
    setMediaUploading(false)
  }

  const handleMediaDelete = async (item: { path: string; url: string }) => {
    const { error: delError } = await supabase.storage.from('business-images').remove([item.path])
    if (delError) { setError(`Failed to delete image: ${delError.message}`); return }
    setMediaItems(prev => prev.filter(m => m.path !== item.path))
  }

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const toggleCategory = (cat: string) => {
    set('categories', form.categories.includes(cat)
      ? form.categories.filter(c => c !== cat)
      : [...form.categories, cat]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    const updates: Partial<Business> & { updated_at: string } = {
      name: form.name,
      description: form.description || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      whatsapp_number: form.whatsapp_number || null,
      website_url: form.website_url || null,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lon: form.lon ? parseFloat(form.lon) : null,
      logo_url: form.logo_url || null,
      is_active: form.is_active,
      categories: form.categories,
      owner_id: form.owner_id,
      updated_at: new Date().toISOString(),
    }

    const { data, error: updateError } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', business.id)
      .select()
      .single()

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setTimeout(() => onSaved(data as Business), 800)
    }
    setSaving(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>✏️ Edit Listing — {business.name}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error   && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">Saved successfully!</div>}

          {/* Owner Reassignment */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label>Owner (reassign business)</label>
            <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
              <option value={business.owner_id}>
                Current: {business.owner_id}
              </option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.email} {u.first_name ? `— ${u.first_name} ${u.last_name || ''}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Business Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} required />
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
              {form.logo_url && (
                <img
                  src={form.logo_url}
                  alt="Current logo"
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 8, border: '1px solid var(--gray-300)', display: 'block' }}
                />
              )}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={e => setLogoFile(e.target.files?.[0] || null)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleLogoUpload}
                  disabled={!logoFile || logoUploading}
                >
                  {logoUploading ? 'Uploading…' : '⬆ Upload Logo'}
                </button>
              </div>
              {form.logo_url && (
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4, wordBreak: 'break-all' }}>
                  {form.logo_url}
                </div>
              )}
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Address</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Latitude</label>
              <input type="number" step="any" value={form.lat} onChange={e => set('lat', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input type="number" step="any" value={form.lon} onChange={e => set('lon', e.target.value)} />
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
                {form.is_active ? 'Active' : 'Inactive'}
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

          {/* Media & Photos */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Media &amp; Photos</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 8 }}>
              <label
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.9rem', borderRadius: 6,
                  border: '1px solid var(--gray-300)', background: '#fff',
                  cursor: mediaUploading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem', color: 'var(--gray-700)', userSelect: 'none',
                }}
              >
                {mediaUploading ? 'Uploading…' : '📷 Add Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleMediaUpload}
                  disabled={mediaUploading}
                  style={{ display: 'none' }}
                />
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>Max 5 MB · JPG, PNG, GIF, WebP</span>
            </div>
            {mediaLoading && <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem', marginTop: 8 }}>Loading media…</p>}
            {!mediaLoading && mediaItems.length === 0 && (
              <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem', marginTop: 8 }}>No media uploaded yet.</p>
            )}
            {mediaItems.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                {mediaItems.map(item => (
                  <div key={item.path} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--gray-300)' }}>
                    <img src={item.url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                    <button
                      type="button"
                      onClick={() => handleMediaDelete(item)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.6)', color: '#fff',
                        border: 'none', borderRadius: '50%', width: 22, height: 22,
                        cursor: 'pointer', fontSize: '0.7rem', lineHeight: '22px',
                        padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      title="Delete photo"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
