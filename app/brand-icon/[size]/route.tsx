import { ImageResponse } from 'next/og'

import { BRAND_MARK_DATA_URI } from '@/lib/brand-mark'

/** PNG of the logo mark (PWA icons, Apple touch icon, favicon fallback). */
const SIZES = new Set([32, 180, 192, 512])

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = parseInt((await params).size, 10)
  const size = SIZES.has(n) ? n : 192
  // Maskable PWA icons need a safe zone: pad the mark on the brand color for the big sizes
  const pad = size >= 180 ? Math.round(size * 0.1) : 0
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pad ? '#0F9D8A' : 'transparent' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_MARK_DATA_URI} width={size - pad * 2} height={size - pad * 2} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } }
  )
}
