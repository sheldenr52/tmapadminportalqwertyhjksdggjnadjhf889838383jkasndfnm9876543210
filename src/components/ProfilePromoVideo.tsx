import { useEffect, useState } from 'react'
import { youtubeEmbedUrl } from '../youtube'
import { supabase } from '../supabase'

// Public-site integration: change the import above to '../supabaseClient'.
export function ProfilePromoVideo({ businessId }: { businessId: string }) {
  const [video, setVideo] = useState<{ storage_path: string | null; youtube_id: string | null; caption: string } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setVideo(null)
    setFailed(false)
    void (async () => {
      const { data, error } = await supabase.from('profile_videos')
        .select('storage_path,youtube_id,caption').eq('business_id', businessId).maybeSingle()
      if (!cancelled && !error) setVideo(data)
    })()
    return () => { cancelled = true }
  }, [businessId])
  if (!video || failed) return null
  return <section aria-label="Promotional video" style={{ marginBottom: 30, borderRadius: 12, overflow: 'hidden', background: '#0b1730', boxShadow: '0 8px 24px #0b173012' }}>
    {video.youtube_id && youtubeEmbedUrl(video.youtube_id) ? <iframe
      src={youtubeEmbedUrl(video.youtube_id)!} title={video.caption || 'Business promotional video'}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', minHeight: 200, border: 0 }}
    /> : video.storage_path ? <video key={video.storage_path} controls playsInline preload="metadata"
      aria-label={video.caption || 'Business promotional video'}
      src={supabase.storage.from('profile-videos').getPublicUrl(video.storage_path).data.publicUrl}
      onError={() => setFailed(true)}
      style={{ display: 'block', width: '100%', maxHeight: '65vh', aspectRatio: '16 / 9', objectFit: 'contain' }}>
      Your browser does not support video playback.
    </video> : null}
  </section>
}
