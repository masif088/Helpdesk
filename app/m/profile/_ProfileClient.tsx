'use client'

import { signOut } from '@/lib/auth-client'

import { BottomNav } from '../_components'

interface Props { name: string; email: string; role: string }

export default function ProfileClient({ name, email, role }: Props) {
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <div style={{ paddingBottom: 70 }}>
      <div style={{ background: '#1a1a2e', padding: '14px 14px 12px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Profile</div>
      </div>

      <div style={{ padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0 8px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff' }}>
            {initials}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f0' }}>{name}</div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>{email}</div>
          </div>
        </div>

        <div style={{ background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a3e', overflow: 'hidden' }}>
          <InfoRow label="Role" value={role} last />
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1px solid #ff4d4f44', background: '#ff4d4f11', color: '#ff4d4f', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Sign Out
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}>DeskTeam360 · v1.0</div>
      </div>

      <BottomNav />
    </div>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '11px 14px', borderBottom: last ? 'none' : '1px solid #2a2a3e', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8c8c8c', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#f0f0f0', fontWeight: 500, textTransform: 'capitalize' }}>{value}</span>
    </div>
  )
}
