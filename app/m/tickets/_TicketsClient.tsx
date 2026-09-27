'use client'

import Link from 'next/link'
import { useState } from 'react'

import { BottomNav } from '../_components'
import { PRIORITY_COLOR } from '../_mock'

type FilterKey = 'open' | 'in_progress' | 'need_response' | 'completed'

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'need_response', label: 'Need Response' },
  { key: 'completed', label: 'Completed' },
]

interface Ticket {
  id: number
  title: string
  priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
  status: string
  statusColor: string
  statusGroup: FilterKey
  company: string
  createdAt: string
}

interface Company { id: string; name: string }
interface Team { id: string; name: string }

interface Props {
  tickets: Ticket[]
  isAgent: boolean
  companies: Company[]
  teams: Team[]
}

export default function TicketsClient({ tickets, isAgent, companies, teams }: Props) {
  const [filter, setFilter] = useState<FilterKey>('open')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [team, setTeam] = useState('')
  const [companySearch, setCompanySearch] = useState('')

  const filtered = tickets.filter((t) => {
    const matchGroup = t.statusGroup === filter
    const matchCompany = !company || t.company === company
    return matchGroup && matchCompany
  })

  const activeFilterCount = (company ? 1 : 0) + (team ? 1 : 0)

  return (
    <div style={{ paddingBottom: 70 }}>
      <div style={{ background: '#1a1a2e', padding: '14px 14px 10px', borderBottom: '1px solid #2a2a3e', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>My Tickets</div>
          {isAgent && (
            <button
              onClick={() => setDrawerOpen(true)}
              style={{ position: 'relative', background: activeFilterCount > 0 ? '#0F9D8A22' : 'transparent', border: `1px solid ${activeFilterCount > 0 ? '#0F9D8A' : '#2a2a3e'}`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: activeFilterCount > 0 ? '#0F9D8A' : '#8c8c8c' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {activeFilterCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: '#0F9D8A', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTER_PILLS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{ flexShrink: 0, padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: filter === f.key ? '#0F9D8A' : '#2a2a3e', color: filter === f.key ? '#fff' : '#8c8c8c' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '40px 0', fontSize: 14 }}>No tickets</div>
        )}
        {filtered.map((t) => (
          <Link key={t.id} href={`/m/tickets/${t.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '12px 14px', border: '1px solid #2a2a3e' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[t.priority], background: `${PRIORITY_COLOR[t.priority]}22`, border: `1px solid ${PRIORITY_COLOR[t.priority]}44`, borderRadius: 4, padding: '2px 7px' }}>
                  {t.priority}
                </span>
                <span style={{ fontSize: 11, color: '#8c8c8c' }}>#{t.id}</span>
                <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>{t.createdAt}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f0', lineHeight: 1.4, marginBottom: 7 }}>{t.title}</div>
              {isAgent && <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 7 }}>🏢 {t.company}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 8, color: t.statusColor }}>●</span>
                <span style={{ fontSize: 12, color: t.statusColor }}>{t.status}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Filter Drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '78%', maxWidth: 300, background: '#1a1a2e', zIndex: 201, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 14px', borderBottom: '1px solid #2a2a3e' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Filter</span>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', color: '#8c8c8c', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <FilterSection label="Team">
                <FilterOption label="All Teams" active={!team} onClick={() => setTeam('')} />
                {teams.map((t) => (
                  <FilterOption key={t.id} label={t.name} active={team === t.name} onClick={() => setTeam(t.name)} />
                ))}
              </FilterSection>
              <FilterSection label="Company">
                <input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Search company..."
                  style={{ width: '100%', background: '#0f1117', border: '1px solid #2a2a3e', borderRadius: 8, padding: '7px 10px', color: '#f0f0f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 6 }}
                />
                <FilterOption label="All Companies" active={!company} onClick={() => setCompany('')} />
                {companies
                  .filter((c) => !companySearch || c.name.toLowerCase().includes(companySearch.toLowerCase()))
                  .map((c) => (
                    <FilterOption key={c.id} label={c.name} active={company === c.name} onClick={() => setCompany(c.name)} />
                  ))}
              </FilterSection>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #2a2a3e', display: 'flex', gap: 10 }}>
              <button onClick={() => { setCompany(''); setTeam(''); setCompanySearch('') }} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8c8c8c', fontSize: 13, cursor: 'pointer' }}>
                Reset
              </button>
              <button onClick={() => setDrawerOpen(false)} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#0F9D8A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Apply
              </button>
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  )
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function FilterOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, border: 'none', background: active ? '#0F9D8A22' : 'transparent', color: active ? '#0F9D8A' : '#d0d0d0', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
      {label}
      {active && <span style={{ fontSize: 14 }}>✓</span>}
    </button>
  )
}
