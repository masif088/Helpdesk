import { ImageResponse } from 'next/og'

import { BRAND_MARK_DATA_URI } from '@/lib/brand-mark'
import { BRANDING } from '@/lib/branding'

/** Share image (Open Graph / Twitter), 1200×630: logo mark, app name and description. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: 'radial-gradient(90% 120% at 100% 0%, #134E4A 0%, #0F172A 60%)',
          color: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_MARK_DATA_URI} width={120} height={120} alt="" />
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>{BRANDING.name}</div>
        </div>
        <div style={{ width: 96, height: 6, background: '#F59E0B', borderRadius: 3, margin: '44px 0 28px' }} />
        <div style={{ fontSize: 40, color: '#CBD5E1', maxWidth: 900, lineHeight: 1.3 }}>{BRANDING.description}</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } }
  )
}
