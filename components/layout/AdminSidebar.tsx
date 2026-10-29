'use client'

import {
  BankOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ContactsOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DollarOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  InboxOutlined,
  NotificationOutlined,
  ReadOutlined,
  SettingOutlined,
  SmileOutlined,
  StarOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import { usePathname, useSearchParams } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import { useSession } from '@/lib/auth-client'
import {
  canAccessCompanies,
  canAccessSettingsHub,
  canAccessTickets,
  canAccessUsers,
  isAdminOrManager,
  isSettingsHrefPathname,
} from '@/lib/auth-utils'
import { BRANDING } from '@/lib/branding'

/** Floating sidebar geometry — AdminMainColumn offsets the page by `sidebarInset(collapsed)`. */
export const SIDEBAR_WIDTH = 236
export const SIDEBAR_RAIL_WIDTH = 72
export const SIDEBAR_GAP = 12

export function sidebarInset(collapsed: boolean): number {
  return (collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH) + SIDEBAR_GAP
}

type NavItem = {
  key: string
  label: string
  icon: ReactNode
  /** Count badge; `alert` = highlighted (work waiting) */
  count?: number
  countTone?: 'alert' | 'muted' | 'danger'
  /** Tooltip on the count */
  countTitle?: string
}

/** Sidebar badge refresh: Inbox / My tickets counts */
const SCOPE_COUNTS_POLL_MS = 60_000
type NavGroup = { title: string; items: NavItem[] }

interface SessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  user_metadata?: { full_name?: string | null; avatar_url?: string | null }
  role?: string
}

interface AdminSidebarProps {
  user: SessionUser
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}

/** Paths that map to a Menu item key (avoid selectedKeys pointing at missing items, e.g. /profile). */
function selectedKeysForPathname(pathname: string | null, ticketsSearch: string): string[] {
  if (!pathname) return []
  if (pathname === '/tickets' || pathname === '/tickets/') {
    const qs = ticketsSearch.trim()
    const sp = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs)
    const tt = sp.get('ticket_type')?.toLowerCase()
    const scope = sp.get('scope')?.toLowerCase()
    if (!tt && scope === 'inbox') return ['/tickets?scope=inbox']
    if (!tt && scope === 'mine') return ['/tickets?scope=mine']
    if (tt === 'notification') return ['/tickets?ticket_type=notification']
    if (tt === 'spam') return ['/tickets?ticket_type=spam']
    if (tt === 'trash') return ['/tickets?ticket_type=trash']
    return ['/tickets']
  }
  if (pathname === '/calendar' || pathname.startsWith('/calendar/')) return ['/calendar']
  if (pathname === '/reference' || pathname.startsWith('/reference/')) return ['/reference']
  if (pathname === '/companies' || pathname.startsWith('/companies/')) return ['/companies']
  if (pathname === '/my-company' || pathname.startsWith('/my-company/')) return ['/my-company']
  if (pathname === '/to-rate') return ['/to-rate']
  if (pathname === '/contacts' || pathname.startsWith('/contacts/')) return ['/contacts']
  if (pathname === '/reports/billing' || pathname.startsWith('/reports/billing/')) return ['/reports/billing']
  if (pathname === '/reports/support' || pathname.startsWith('/reports/support/')) return ['/reports/support']
  if (pathname === '/reports/sla' || pathname.startsWith('/reports/sla/')) return ['/reports/sla']
  if (pathname === '/reports/ratings') return ['/reports/ratings']
  if (pathname === '/reports/workload' || pathname.startsWith('/reports/workload/')) return ['/reports/workload']
  if (isSettingsHrefPathname(pathname)) return ['/settings']
  const topLevel = ['/dashboard']
  const top = topLevel.find((k) => pathname === k || (k !== '/dashboard' && pathname.startsWith(`${k}/`)))
  if (top) return [top]
  const ticketsDetail = pathname.startsWith('/tickets/')
  if (ticketsDetail) return ['/tickets']
  return []
}

export default function AdminSidebar({ user, collapsed, onCollapse }: AdminSidebarProps) {
  const { data: session } = useSession()
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  const role = ((user.role ?? sessionRole) ?? '').toLowerCase()
  const isCustomer = role === 'customer'
  const pathname = usePathname()
  const ticketsListSearch = useSearchParams().toString()
  const [appName, setAppName] = useState<string>(BRANDING.name)
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(BRANDING.logo)

  const showScopeCounts = !isCustomer && canAccessTickets(role)
  const [scopeCounts, setScopeCounts] = useState<{ inbox: number; mine: number; overdue: number; reminderHours: number } | null>(null)
  // Refresh on an interval, on window focus, and whenever the route changes (e.g. after assigning a ticket).
  useEffect(() => {
    if (!showScopeCounts) return
    let alive = true
    const load = () =>
      fetch('/api/tickets/scope-counts', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d && typeof d.inbox === 'number')
            setScopeCounts({ inbox: d.inbox, mine: d.mine ?? 0, overdue: d.overdue ?? 0, reminderHours: d.reminder_hours ?? 0 })
        })
        .catch(() => {})
    void load()
    const id = setInterval(load, SCOPE_COUNTS_POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('focus', load)
    }
  }, [showScopeCounts, pathname, ticketsListSearch])

  useEffect(() => {
    fetch('/api/app-settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.app_name) setAppName(d.app_name)
        setAppLogoUrl(d.app_logo_url ?? BRANDING.logo)
      })
      .catch(() => {})
  }, [])

  const groups = useMemo<NavGroup[]>(() => {
    const out: NavGroup[] = [
      {
        title: 'Overview',
        items: [
          { key: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
          { key: '/calendar', label: 'Calendar', icon: <CalendarOutlined /> },
        ],
      },
    ]
    if (canAccessTickets(role)) {
      out.push({
        title: 'Tickets',
        items: isCustomer
          ? [{ key: '/tickets', label: 'Tickets', icon: <CheckSquareOutlined /> }]
          : [
              {
                key: '/tickets?scope=inbox',
                label: 'Inbox',
                icon: <InboxOutlined />,
                count: scopeCounts?.inbox,
                countTone: scopeCounts?.overdue ? 'danger' : 'alert',
                countTitle: scopeCounts?.overdue
                  ? `${scopeCounts.overdue} waiting more than ${scopeCounts.reminderHours}h`
                  : undefined,
              },
              {
                key: '/tickets?scope=mine',
                label: 'My tickets',
                icon: <UserOutlined />,
                count: scopeCounts?.mine,
                countTone: 'muted',
              },
              { key: '/tickets', label: 'All tickets', icon: <CheckSquareOutlined /> },
              { key: '/tickets?ticket_type=notification', label: 'Notifications', icon: <NotificationOutlined /> },
              { key: '/tickets?ticket_type=spam', label: 'Spam', icon: <WarningOutlined /> },
              { key: '/tickets?ticket_type=trash', label: 'Trash', icon: <DeleteOutlined /> },
            ],
      })
      out.push({ title: 'Knowledge', items: [{ key: '/reference', label: 'Reference', icon: <ReadOutlined /> }] })
    }
    if (!isCustomer) {
      const clients: NavItem[] = []
      if (canAccessCompanies(role)) clients.push({ key: '/companies', label: 'Companies', icon: <BankOutlined /> })
      if (canAccessUsers(role)) clients.push({ key: '/contacts', label: 'Contacts', icon: <ContactsOutlined /> })
      if (clients.length) out.splice(2, 0, { title: 'Clients', items: clients })
    }
    if (isCustomer) {
      out.push({ title: 'Company', items: [{ key: '/my-company', label: 'My company', icon: <BankOutlined /> }, { key: '/to-rate', label: 'Rate your tickets', icon: <SmileOutlined /> }] })
    }
    if (!isCustomer && isAdminOrManager(role)) {
      out.push({
        title: 'Reports',
        items: [
          { key: '/reports/support', label: 'Support', icon: <BarChartOutlined /> },
          { key: '/reports/workload', label: 'Workload', icon: <TeamOutlined /> },
          { key: '/reports/sla', label: 'SLA & satisfaction', icon: <SmileOutlined /> },
          { key: '/reports/ratings', label: 'Ratings', icon: <StarOutlined /> },
          { key: '/reports/billing', label: 'Billing', icon: <DollarOutlined /> },
        ],
      })
    }
    if (!isCustomer && canAccessSettingsHub(role)) {
      out.push({ title: 'Admin', items: [{ key: '/settings', label: 'Settings', icon: <SettingOutlined /> }] })
    }
    return out
  }, [role, isCustomer, scopeCounts])

  const selectedKeys = useMemo(
    () => selectedKeysForPathname(pathname, pathname?.startsWith('/tickets') ? ticketsListSearch : ''),
    [pathname, ticketsListSearch]
  )

  const width = collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH

  return (
    <aside
      className={`app-sidebar${collapsed ? ' app-sidebar--rail' : ''}`}
      style={{ width, top: SIDEBAR_GAP, left: SIDEBAR_GAP, bottom: SIDEBAR_GAP }}
      aria-label="Main navigation"
    >
      <div className="app-sidebar__brand">
        {appLogoUrl && !collapsed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={appLogoUrl}
            alt={appName}
            style={{ height: 30, maxWidth: '100%', objectFit: 'contain' }}
            onError={() => setAppLogoUrl(null)}
            // The image may already have failed before hydration attached onError.
            ref={(el) => {
              if (el && el.complete && el.naturalWidth === 0) setAppLogoUrl(null)
            }}
          />
        ) : (
          <>
            <span className="app-sidebar__mark" aria-hidden>
              {(appName || 'D').trim().charAt(0).toUpperCase()}
            </span>
            {!collapsed ? <span className="app-sidebar__name">{appName}</span> : null}
          </>
        )}
      </div>

      <nav className="app-sidebar__nav">
        {groups.map((group) => (
          <div key={group.title} className="app-sidebar__group">
            {collapsed ? (
              <div className="app-sidebar__divider" />
            ) : (
              <div className="app-sidebar__group-title">{group.title}</div>
            )}
            {group.items.map((item) => {
              const active = selectedKeys.includes(item.key)
              const link = (
                <SpaNavLink
                  key={item.key}
                  href={item.key}
                  className={`app-sidebar__item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                >
                  <span className="app-sidebar__icon">
                    {item.icon}
                    {collapsed && item.count ? <span className={`app-sidebar__dot is-${item.countTone ?? 'muted'}`} /> : null}
                  </span>
                  {!collapsed ? <span className="app-sidebar__label">{item.label}</span> : null}
                  {!collapsed && item.count ? (
                    <span className={`app-sidebar__count is-${item.countTone ?? 'muted'}`} title={item.countTitle}>
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  ) : null}
                </SpaNavLink>
              )
              return collapsed ? (
                <Tooltip key={item.key} title={item.count ? `${item.label} (${item.count})` : item.label} placement="right">
                  <span style={{ display: 'block' }}>{link}</span>
                </Tooltip>
              ) : (
                link
              )
            })}
          </div>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <button
            type="button"
            className="app-sidebar__toggle"
            onClick={() => onCollapse(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
