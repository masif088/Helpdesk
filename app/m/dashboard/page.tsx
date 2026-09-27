import Link from 'next/link'

import { BottomNav } from '../_components'
import { getMobileDashboardStats, getMobileSession, getMobileTickets } from '../_data'
import { PRIORITY_COLOR } from '../_mock'

export default async function MobileDashboard() {
  const [user, stats, recent] = await Promise.all([
    getMobileSession(),
    getMobileDashboardStats(),
    getMobileTickets(),
  ])

  const recentTickets = (recent ?? []).filter((t) => t.statusGroup !== 'completed').slice(0, 3)

  return (
    <div style={{ paddingBottom: 70 }}>
      <div style={{ background: '#1a1a2e', padding: '14px 16px 12px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 1 }}>DeskTeam360</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>Dashboard</div>
      </div>

      <div style={{ padding: '14px 14px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <StatCard label="Open" value={stats?.open ?? 0} color="#8c8c8c" />
          <StatCard label="In Progress" value={stats?.inProgress ?? 0} color="#52c41a" />
          <StatCard label="Need Response" value={stats?.needResponse ?? 0} color="#fa8c16" />
          <StatCard label="Completed (week)" value={stats?.completedThisWeek ?? 0} color="#1677ff" />
        </div>
      </div>

      <div style={{ padding: '16px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Recent Tickets</div>
          <Link href="/m/tickets" style={{ fontSize: 12, color: '#0F9D8A', textDecoration: 'none' }}>See all →</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentTickets.length === 0 && (
            <div style={{ fontSize: 13, color: '#8c8c8c', padding: '12px 0' }}>No open tickets</div>
          )}
          {recentTickets.map((t) => (
            <Link key={t.id} href={`/m/tickets/${t.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '12px 14px', border: '1px solid #2a2a3e' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[t.priority], background: `${PRIORITY_COLOR[t.priority]}22`, border: `1px solid ${PRIORITY_COLOR[t.priority]}44`, borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>{t.priority}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 3 }}>#{t.id} · {t.company}</div>
                  </div>
                  <span style={{ fontSize: 8, color: t.statusColor, flexShrink: 0, marginTop: 4 }}>●</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '12px 14px', border: '1px solid #2a2a3e' }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
