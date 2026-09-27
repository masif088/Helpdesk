import type { MetadataRoute } from 'next'

import { BRANDING } from '@/lib/branding'

/** PWA manifest (served at /manifest.webmanifest) — name and description from env branding. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRANDING.name,
    short_name: BRANDING.name,
    description: BRANDING.description,
    start_url: '/m/tickets',
    display: 'standalone',
    background_color: '#0B1220',
    theme_color: '#0F9D8A',
    orientation: 'portrait',
    icons: [
      { src: '/brand-icon/192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
