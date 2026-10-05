import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { IMAGE_EXTENSIONS, MAX_PICTURE_SIZE, PICTURE_BUCKET, parseProfileLink, profileUrl } from '../../pictures'

interface Picture { id: string; storage_path: string; caption: string; business_id: string | null }
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

const ProfileButton = ({ businessId }: { businessId: string | null }) => businessId
  ? <a className="btn btn-primary" href={profileUrl(businessId)} target="_blank" rel="noopener noreferrer">View profile</a>
  : <button className="btn btn-ghost" type="button" disabled>Profile not linked</button>

function PictureCard({ picture, onSaved, onDeleted }: { picture: Picture; onSaved: (picture: Picture) => void; onDeleted: (id: string, warning?: string) => void }) {
  const [link, setLink] = useState(picture.business_id ? profileUrl(picture.business_id) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = async () => {
    if (busy || deleting) return
    if (!window.confirm(`Permanently delete "${picture.caption}" from the picture gallery? This cannot be undone. The linked business profile will remain.`)) return
    setDeleting(true); setError(''); setSaved(false)
    try {
      const { data, error: deleteError } = await supabase.from('picture_gallery').delete().eq('id', picture.id).select('id').single()
      if (deleteError) throw new Error(deleteError.message)
      if (data?.id !== picture.id) throw new Error('The picture was not deleted. Check your permissions and try again.')
      let warning: string | undefined
      try {
        const { error: storageError } = await supabase.storage.from(PICTURE_BUCKET).remove([picture.storage_path])
        if (storageError) throw new Error(storageError.message)
      } catch (cleanupError) {
        warning = `Picture removed from the gallery, but its uploaded file could not be deleted: ${message(cleanupError)}`
      }
      onDeleted(picture.id, warning)
    } catch (deleteError) { setError(`Could not delete picture: ${message(deleteError)}`) }
    finally { setDeleting(false) }
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setSaved(false)
    try {
      const business_id = parseProfileLink(link)
      const { data, error } = await supabase.from('picture_gallery').update({ business_id }).eq('id', picture.id).select().single()
      if (error) throw new Error(error.code === '23503' ? 'That business profile does not exist.' : error.message)
      onSaved(data); setSaved(true)
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  return <article className="card picture-card">
    <img className="picture-image" src={supabase.storage.from(PICTURE_BUCKET).getPublicUrl(picture.storage_path).data.publicUrl} alt={picture.caption} loading="lazy" />
    <div className="card-body">
      <p className="picture-caption">{picture.caption}</p>
      <ProfileButton businessId={picture.business_id} />
      <form onSubmit={save} className="picture-link-form">
        <div className="form-group">
          <label htmlFor={`link-${picture.id}`}>Profile URL (optional)</label>
          <input id={`link-${picture.id}`} type="url" value={link} disabled={busy || deleting} onChange={e => { setLink(e.target.value); setSaved(false) }} placeholder="https://themap.co.za/business?business=…" />
          <small>Leave blank to unlink this picture.</small>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={busy || deleting}>{busy ? 'Saving…' : 'Save profile link'}</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={busy || deleting} aria-label={`Delete picture ${picture.caption}`} onClick={() => void remove()}>
          {deleting ? 'Deleting...' : 'Delete picture'}
        </button>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {saved && <p role="status">Profile link saved.</p>}
      </form>
    </div>
  </article>
}

export function AdminPictures() {
  const [pictures, setPictures] = useState<Picture[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const load = async () => {
    setLoading(true); setLoadError('')
    try {
      const { data, error } = await supabase.from('picture_gallery').select('id,storage_path,caption,business_id').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      setPictures(data ?? [])
    } catch (error) { setLoadError(message(error)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const upload = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true)
    try {
      if (!file) throw new Error('Choose a picture to upload.')
      if (!IMAGE_EXTENSIONS[file.type]) throw new Error('Choose a JPEG, PNG, WebP or GIF image.')
      if (!file.size || file.size > MAX_PICTURE_SIZE) throw new Error('Pictures must be between 1 byte and 6 MB.')
      const business_id = parseProfileLink(link)
      if (business_id) {
        const { data, error } = await supabase.from('businesses').select('id').eq('id', business_id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('That business profile does not exist.')
      }
      const storage_path = `${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`
      const { error: uploadError } = await supabase.storage.from(PICTURE_BUCKET).upload(storage_path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      const { data, error: saveError } = await supabase.from('picture_gallery').insert({ storage_path, caption: caption.trim() || file.name, business_id }).select().single()
      if (saveError) {
        const { error: cleanupError } = await supabase.storage.from(PICTURE_BUCKET).remove([storage_path])
        throw new Error(`${saveError.message}${cleanupError ? ' The uploaded file could not be cleaned up.' : ''}`)
      }
      setPictures(previous => [data, ...previous]); setFile(null); setCaption(''); setLink('')
      if (fileInput.current) fileInput.current.value = ''
      setSuccess('Picture uploaded.')
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  return <>
    <section className="card">
      <div className="card-header"><h2>Upload a picture</h2></div>
      <form className="card-body" onSubmit={upload}>
        <p className="picture-help">Upload a picture with an optional link to a business profile. You can link or unlink it later.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}
        <div className="form-grid">
          <div className="form-group"><label htmlFor="picture-file">Picture</label><input ref={fileInput} id="picture-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /><small>JPEG, PNG, WebP or GIF. Maximum 6 MB.</small></div>
          <div className="form-group"><label htmlFor="picture-caption">Caption (optional)</label><input id="picture-caption" maxLength={300} value={caption} disabled={busy} onChange={e => setCaption(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="picture-profile">Profile URL (optional)</label><input id="picture-profile" type="url" value={link} disabled={busy} onChange={e => setLink(e.target.value)} placeholder="https://themap.co.za/business?business=…" /></div>
        </div>
        {preview && <img className="picture-preview" src={preview} alt="Selected picture preview" />}
        <div className="form-actions"><button className="btn btn-primary" disabled={busy || loading || !!loadError}>{busy ? 'Uploading…' : 'Upload picture'}</button></div>
      </form>
    </section>
    <div className="card-header"><h2>Uploaded pictures ({pictures.length})</h2></div>
    {loadError && <div className="alert alert-error" role="alert">Could not load pictures: {loadError} <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Retry</button></div>}
    {loading ? <div className="loading-overlay">Loading pictures…</div> : !loadError && !pictures.length ? <div className="empty-state"><p>No pictures yet. Upload your first picture above.</p></div> : null}
    <div className="picture-grid">{pictures.map(picture => <PictureCard key={picture.id} picture={picture} onSaved={updated => setPictures(previous => previous.map(item => item.id === updated.id ? updated : item))} onDeleted={(id, warning) => {
      setPictures(previous => previous.filter(item => item.id !== id))
      setError(warning || '')
      setSuccess(warning ? '' : 'Picture deleted.')
    }} />)}</div>
  </>
}
