export const PICTURE_BUCKET = 'profile-pictures'
export const MAX_PICTURE_SIZE = 6 * 1024 * 1024
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}

export function parseProfileLink(value: string): string | null {
  if (!value.trim()) return null
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a valid The Map business profile URL.') }
  const id = url.searchParams.get('business')
  if (url.protocol !== 'https:' || url.hostname !== 'themap.co.za' || url.port ||
      url.username || url.password || url.pathname !== '/business' ||
      !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Use https://themap.co.za/business?business= followed by the business ID.')
  }
  return id.toLowerCase()
}

export function profileUrl(id: string): string {
  return `https://themap.co.za/business?business=${encodeURIComponent(id)}`
}
