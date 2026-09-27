'use client'

import {
  CheckSquareOutlined,
  DashboardOutlined,
  DeleteOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReadOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Layout, Menu } from 'antd'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { shouldOpenHrefInNewTab,SpaNavLink } from '@/components/common/SpaNavLink'
import { useSession } from '@/lib/auth-client'
import {
  canAccessSettingsHub,
  canAccessTickets,
  isSettingsHrefPathname,
} from '@/lib/auth-utils'

const { Sider } = Layout

const SIDEBAR_BG = '#0F172A'

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
    if (tt === 'spam') return ['/tickets?ticket_type=spam']
    if (tt === 'trash') return ['/tickets?ticket_type=trash']
    return ['/tickets']
  }
  if (pathname === '/reference' || pathname.startsWith('/reference/')) return ['/reference']
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return ['/projects']
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
  const router = useRouter()
  const pathname = usePathname()
  const ticketsListSearch = useSearchParams().toString()
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [appName, setAppName] = useState<string>(process.env.NEXT_PUBLIC_APP_NAME ?? 'DeskTeam360')
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/app-settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.app_name) setAppName(d.app_name)
        setAppLogoUrl(d.app_logo_url ?? null)
      })
      .catch(() => {})
  }, [])

  const linkLabel = (path: string, text: string) => (
    <SpaNavLink href={path} title={text} className="admin-sidebar-menu-link" onClick={(e) => e.stopPropagation()}>
      {text}
    </SpaNavLink>
  )

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: linkLabel('/dashboard', 'Dashboard'),
    },
    // ...(canAccessProjects(role)
    //   ? [
    //       {
    //         key: '/projects',
    //         icon: <FolderOutlined />,
    //         label: linkLabel('/projects', 'Projects'),
    //       },
    //     ]
    //   : []),
    ...(canAccessTickets(role)
      ? [
          ...(isCustomer
            ? [
                {
                  key: '/tickets',
                  icon: <CheckSquareOutlined />,
                  label: linkLabel('/tickets', 'Tickets'),
                },
              ]
            : [
                {
                  key: '/tickets',
                  icon: <CheckSquareOutlined />,
                  label: linkLabel('/tickets', 'All tickets'),
                },
                {
                  key: '/tickets?ticket_type=spam',
                  icon: <WarningOutlined />,
                  label: linkLabel('/tickets?ticket_type=spam', 'Spam'),
                },
                {
                  key: '/tickets?ticket_type=trash',
                  icon: <DeleteOutlined />,
                  label: linkLabel('/tickets?ticket_type=trash', 'Trash'),
                },
              ]),
          {
            key: '/reference',
            icon: <ReadOutlined />,
            label: linkLabel('/reference', 'Reference'),
          },
        ]
      : []),
    ...(canAccessSettingsHub(role)
      ? [
          {
            key: '/settings',
            icon: <SettingOutlined />,
            label: linkLabel('/settings', 'Settings'),
          },
        ]
      : []),
  ].filter((item) => {
    if (isCustomer) {
      return item.key !== '/settings'
    }
    const ticketMenuKeys = ['/tickets', '/tickets?ticket_type=spam', '/tickets?ticket_type=trash']
    if (ticketMenuKeys.includes(item.key as string) && !canAccessTickets(role)) return false
    if (item.key === '/settings' && !canAccessSettingsHub(role)) return false
    return true
  })

  const selectedKeys = useMemo(
    () => selectedKeysForPathname(pathname, pathname?.startsWith('/tickets') ? ticketsListSearch : ''),
    [pathname, ticketsListSearch]
  )

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={250}
      className="admin-sidebar-deskteam deskteam-app-sidebar"
      style={{
        overflow: 'hidden',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        height: undefined,
        minHeight: '100dvh',
        background: SIDEBAR_BG,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0 16px' : '0 16px 0 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
          gap: 8,
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            {appLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={appLogoUrl}
                alt={appName}
                style={{ flexShrink: 0, objectFit: 'contain', width: '100%', height: 36, maxHeight: 36 }}
              />
            ) : (
              <>
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'linear-gradient(135deg, #14B8A6 0%, #0F9D8A 55%, #0B7A6B 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  {(appName || 'D').trim().charAt(0).toUpperCase()}
                </span>
                <span
                  style={{
                    color: '#F8FAFC',
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {appName}
                </span>
              </>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div
            onClick={() => onCollapse(!collapsed)}
            style={{
              cursor: 'pointer',
              color: 'rgba(226, 232, 240, 0.7)',
              fontSize: 16,
            }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Menu
          theme="dark"
          mode="inline"
          className="admin-sidebar-menu"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          items={menuItems}
          style={{
            borderRight: 0,
            marginTop: 12,
            marginBottom: 24,
            background: 'transparent',
          }}
          onClick={({ key, domEvent }) => {
            if (
              key &&
              typeof key === 'string' &&
              key.startsWith('/') &&
              !(domEvent.target as HTMLElement)?.closest('a')
            ) {
              if (shouldOpenHrefInNewTab(domEvent)) {
                window.open(key, '_blank', 'noopener,noreferrer')
              } else if (!('button' in domEvent) || domEvent.button === 0) {
                router.push(key)
              }
            }
          }}
        />
      </div>

    </Sider>
  )
}
