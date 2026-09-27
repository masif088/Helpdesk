'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function BottomNav() {
  const path = usePathname()

  const items = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      href: '/m/dashboard',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F9D8A' : '#8c8c8c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      key: 'tickets',
      label: 'Tickets',
      href: '/m/tickets',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F9D8A' : '#8c8c8c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
        </svg>
      ),
    },
    {
      key: 'profile',
      label: 'Profile',
      href: '/m/profile',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F9D8A' : '#8c8c8c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ]

  const active = items.find((i) => path.startsWith(i.href))?.key ?? 'tickets'

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#1a1a2e', borderTop: '1px solid #2a2a3e',
      display: 'flex', zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map((item) => {
        const isActive = active === item.key
        return (
          <Link key={item.key} href={item.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '8px 0 10px', textDecoration: 'none',
            color: isActive ? '#0F9D8A' : '#8c8c8c',
            borderTop: isActive ? '2px solid #0F9D8A' : '2px solid transparent',
          }}>
            {item.icon(isActive)}
            <span style={{ fontSize: 10, marginTop: 3, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
