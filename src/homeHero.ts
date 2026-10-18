import { supabase } from './supabase'

export const HERO_BUCKET = 'home-hero'
export interface HeroSlide {
  id: string; title: string; caption: string; image_path: string; mobile_image_path: string | null
  image_alt: string; cta_label: string; cta_url: string; cta_new_tab: boolean; sort_order: number; is_active: boolean
}
export function validHeroUrl(value: string): boolean {
  if (!value || value.length > 2048 || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false
  if (value.startsWith('/')) return !value.startsWith('//')
  try { const url = new URL(value); return value.startsWith('https://') && !!url.hostname && !url.username && !url.password } catch { return false }
}
export const heroImageUrl = (path: string) => supabase.storage.from(HERO_BUCKET).getPublicUrl(path).data.publicUrl
export async function verifyHeroImage(path: string) {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => reject(new Error('Image verification timed out.')), 15000)
    image.onload = () => { clearTimeout(timer); resolve() }
    image.onerror = () => { clearTimeout(timer); reject(new Error('The selected image could not be loaded.')) }
    image.src = heroImageUrl(path)
  })
}
export async function uploadHeroImage(file: File, id: string, variant: string) {
  const extensions: Record<string, string> = { 'image/avif': 'avif', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
  if (!extensions[file.type] || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose an AVIF, WebP, JPEG or PNG image up to 5 MB.')
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  const actual = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes[0] === 137 && ascii(1, 4) === 'PNG' ? 'image/png'
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp'
    : ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32)) ? 'image/avif' : ''
  if (actual !== file.type) throw new Error('Image contents do not match the file type.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This file is not a readable image.') })
  bitmap.close()
  const path = `slides/${id}/${variant}-${crypto.randomUUID()}.${extensions[file.type]}`
  const { error } = await supabase.storage.from(HERO_BUCKET).upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}
