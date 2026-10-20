import { jsPDF } from 'jspdf'
import type { Business } from './supabase'

export interface ProfilePdfMedia {
  photos: string[]
  videoUrl?: string
  videoThumbnail?: string
  videoCaption?: string
}

// Images are normalized through canvas so WebP and transparent logos work in PDFs.
async function imageData(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined
  return new Promise(resolve => {
    const img = new Image()
    const timer = window.setTimeout(() => { img.src = ''; resolve(undefined) }, 12000)
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      window.clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height))
        canvas.width = img.width * scale; canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch { resolve(undefined) }
    }
    img.onerror = () => { window.clearTimeout(timer); resolve(undefined) }
    img.src = url
  })
}

export async function createProfilePdf(b: Business, media: ProfilePdfMedia) {
  const [logo, thumbnail, ...photos] = await Promise.all([
    imageData(b.logo_url || undefined), imageData(media.videoThumbnail), ...media.photos.slice(0, 6).map(imageData),
  ])
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setProperties({ title: `${b.name} - Profile preview`, author: 'The Map' })
  let y = 12
  const text = (value: string, x: number, top: number, size = 10, bold = false, width = 166) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor('#26344a')
    const lines = pdf.splitTextToSize(value, width) as string[]
    pdf.text(lines, x, top, { lineHeightFactor: 1.35 })
    return lines.length * size * 0.3528 * 1.35
  }
  let condensed = media.photos.length > 6
  const fitText = (value: string, x: number, top: number, width: number, maxLines: number, size = 9, color = '#4b5057', bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color)
    const lines = pdf.splitTextToSize(value, width) as string[]
    if (lines.length > maxLines) {
      condensed = true
      lines.length = maxLines
      let last = lines[maxLines - 1]
      while (pdf.getTextWidth(last + '...') > width) last = last.slice(0, -1)
      lines[maxLines - 1] = last + '...'
    }
    pdf.text(lines, x, top, { lineHeightFactor: 1.35 })
    return lines.length * size * 0.3528 * 1.35
  }
  const card = (height: number) => { pdf.setFillColor('#ffffff'); pdf.roundedRect(12, y, 186, height, 3, 3, 'F') }
  const image = (data: string, x: number, top: number, w: number, h: number) => {
    const props = pdf.getImageProperties(data)
    const scale = Math.min(w / props.width, h / props.height)
    const iw = props.width * scale, ih = props.height * scale
    pdf.addImage(data, 'JPEG', x + (w - iw) / 2, top + (h - ih) / 2, iw, ih)
  }
  pdf.setFillColor('#edf3fb'); pdf.rect(0, 0, 210, 297, 'F')
  if (logo) image(logo, 16, y, 19, 19)
  const titleX = logo ? 42 : 20
  fitText(b.name, titleX, y + 6, logo ? 150 : 174, 2, 17, '#30363e', true)
  y += 23
  if (media.videoUrl) {
    pdf.setFillColor('#122440'); pdf.roundedRect(12, y, 186, 68, 3, 3, 'F')
    if (thumbnail) image(thumbnail, 12, y, 186, 68)
    pdf.setFillColor('#e12438'); pdf.roundedRect(97, y + 27, 16, 12, 3, 3, 'F')
    pdf.setFillColor('#ffffff'); pdf.triangle(103, y + 30, 103, y + 36, 108, y + 33, 'F')
    pdf.link(12, y, 186, 68, { url: media.videoUrl })
    y += 74
  }
  const section = (heading: string, value: string) => {
    // Reserve the contact card, gallery and page margins, then fit every line
    // of the description into the remaining space without truncating it.
    const available = 287 - y - (b.website_url ? 80 : 67) - 40 - 12 - 23
    pdf.setFont('helvetica', 'normal')
    let size = 9
    let lines: string[] = []
    let bodyHeight = 0
    do {
      pdf.setFontSize(size)
      lines = pdf.splitTextToSize(value, 174) as string[]
      bodyHeight = lines.length * size * 0.3528 * 1.35
      if (bodyHeight <= available) break
      size *= 0.95
    } while (size > 0.01)
    const height = 23 + bodyHeight
    card(height)
    // Outline document icon on the same pale tile as the website's section icons.
    pdf.setFillColor('#f7f9fa'); pdf.roundedRect(17, y + 5, 6, 7, 1, 1, 'F')
    pdf.setDrawColor('#969fa9'); pdf.setLineWidth(0.3)
    pdf.lines([[1.6, 0], [1.1, 1.1], [0, 3.2], [-2.7, 0], [0, -4.3]], 18.6, y + 6.3)
    pdf.line(20.2, y + 6.3, 20.2, y + 7.4)
    pdf.line(20.2, y + 7.4, 21.3, y + 7.4)
    pdf.line(19.2, y + 8.4, 20.7, y + 8.4)
    pdf.line(19.2, y + 9.3, 20.7, y + 9.3)
    fitText(heading, 25, y + 9.8, 164, 1, 10, '#50555b', true)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor('#959ca5')
    pdf.text(lines, 16, y + 18, { lineHeightFactor: 1.35 })
    y += height + 6
  }
  section('About Us', b.description || 'More information coming soon.')
  const infoHeight = b.website_url ? 80 : 67
  card(infoHeight)
  pdf.setDrawColor('#edf0f3'); pdf.setLineWidth(0.2)
  pdf.line(91, y + 4, 91, y + infoHeight - 4); pdf.line(145, y + 4, 145, y + infoHeight - 4)
  // Small outline icons drawn as vectors to stay sharp at print resolution.
  const icon = (kind: 'phone' | 'pin' | 'home', x: number, top: number) => {
    pdf.setFillColor('#f7f9fa'); pdf.roundedRect(x - 1, top - 1, 6, 6, 1, 1, 'F')
    pdf.setDrawColor('#909aa5'); pdf.setLineWidth(0.35)
    if (kind === 'pin') {
      pdf.circle(x + 2, top + 1.5, 1.5); pdf.circle(x + 2, top + 1.5, 0.5)
      pdf.line(x + 0.8, top + 2.4, x + 2, top + 4); pdf.line(x + 3.2, top + 2.4, x + 2, top + 4)
    } else if (kind === 'home') {
      pdf.line(x, top + 1.5, x + 2, top); pdf.line(x + 2, top, x + 4, top + 1.5)
      pdf.rect(x + 0.4, top + 1.5, 3.2, 2.8); pdf.rect(x + 1.5, top + 2.7, 1, 1.6)
    } else {
      pdf.lines([[0.4, 1.5], [1.2, 1.4], [1.5, 0.6], [0.9, -0.8], [-0.2, -0.7], [-1, -0.3], [-0.5, 0.4], [-1, -1], [0.3, -0.5], [-0.4, -1], [-0.7, -0.2], [-0.8, 0.6]], x, top + 0.3)
    }
  }
  ;([{ x: 18, label: 'Contact', kind: 'phone' }, { x: 97, label: 'Location', kind: 'pin' }, { x: 151, label: 'Categories', kind: 'home' }] as const).forEach(item => {
    icon(item.kind, item.x, y + 6)
    fitText(item.label, item.x + 7, y + 9, 40, 1, 10, '#44494e', true)
  })
  const contactRow = (label: string, value: string | null, top: number, action?: string, url?: string) => {
    fitText(label, 18, top, 66, 1, 7, '#959da5')
    pdf.setFillColor('#f7f8f9'); pdf.roundedRect(18, top + 2, 67, 9, 1, 1, 'F')
    fitText(value || 'Not provided', 20, top + 7.7, action ? 48 : 63, 1, 7.5, label === 'Email' && value ? '#405f9a' : '#52575c')
    if (value && url) pdf.link(18, top + 2, 67, 9, { url })
    if (action && value) {
      pdf.setFillColor(action === 'Call' ? '#49b260' : '#33d576'); pdf.roundedRect(70, top + 3.5, 13, 6, 1, 1, 'F')
      fitText(action, 71, top + 7.5, 11, 1, 6.5, '#ffffff', true)
    }
  }
  const phone = b.contact_phone?.replace(/[^\d+]/g, '')
  const whatsapp = (b.whatsapp_number || '').replace(/\D/g, '').replace(/^0/, '27')
  contactRow('Phone', b.contact_phone, y + 19, 'Call', phone ? `tel:${phone}` : undefined)
  contactRow('WhatsApp', b.whatsapp_number, y + 34, 'Message', whatsapp ? `https://wa.me/${whatsapp}` : undefined)
  contactRow('Email', b.contact_email, y + 49, undefined, b.contact_email ? `mailto:${b.contact_email}` : undefined)
  if (b.website_url) contactRow('Website', b.website_url, y + 64, undefined, /^https?:\/\//i.test(b.website_url) ? b.website_url : `https://${b.website_url}`)
  fitText(b.address || 'Location coming soon.', 97, y + 20, 42, 10, 8.5)
  let tagX = 151, tagY = y + 16
  for (const category of b.categories || []) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
    const width = Math.min(40, pdf.getTextWidth(category) + 5)
    if (tagX + width > 192) { tagX = 151; tagY += 9 }
    if (tagY + 7 > y + infoHeight - 4) { condensed = true; break }
    pdf.setFillColor('#e4f3ff'); pdf.setDrawColor('#b8dfff'); pdf.setLineWidth(0.2)
    pdf.roundedRect(tagX, tagY, width, 7, 1, 1, 'FD')
    fitText(category, tagX + 2, tagY + 4.6, width - 4, 1, 7, '#348ad0')
    tagX += width + 2
  }
  y += infoHeight + 6
  card(40); text('Gallery', 18, y + 9, 11, true)
  if (!photos.length) fitText('Photos coming soon.', 18, y + 23, 174, 1)
  photos.forEach((photo, index) => {
    const x = 18 + index * 29
    if (photo) image(photo, x, y + 13, 27, 23)
    else fitText('Image unavailable', x, y + 24, 26, 2, 6)
  })
  if (media.photos.length > 6) fitText(`Showing 6 of ${media.photos.length} photos`, 150, y + 9, 42, 1, 7, '#959da5')
  return { pdf, filename: `${b.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'business'}-profile-preview.pdf`,
    condensed, missingImages: photos.filter(p => !p).length + (b.logo_url && !logo ? 1 : 0) }
}
