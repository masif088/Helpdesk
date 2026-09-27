'use client'

import 'dayjs/locale/en'

import { CloseOutlined, HistoryOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { Button, Input, Modal, Popover, Space, Spin, Switch, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import ThemeToggle from '@/components/common/ThemeToggle'
import NavbarAccount, { type NavbarAccountUser } from '@/components/layout/NavbarAccount'
import ActiveTimeTrackerNavButton from '@/components/ticket/ActiveTimeTrackerNavButton'
import TicketActivityActorAvatar from '@/components/ticket/TicketActivityActorAvatar'
import TicketNotificationBell from '@/components/ticket/TicketNotificationBell'
import { BRANDING } from '@/lib/branding'
import {
  formatTicketActivityNavbarLabel,
  isTicketActivityNavbarPeekRow,
} from '@/lib/ticket-activity-labels'
import {
  loadSavedTicketFilterPresets,
  removeSavedTicketFilterPreset,
  SAVED_FILTERS_CHANGED_EVENT,
  type SavedTicketFilterPreset,
} from '@/lib/ticket-saved-filters'

dayjs.extend(relativeTime)
dayjs.locale('en')

const { Text } = Typography

type ActivityPeekRow = {
  id: string
  ticket_id: number
  ticket_title: string
  action: string
  actor_role: string
  created_at: string
  actor: { name: string | null; email: string | null; avatar_url?: string | null } | null
}

const NAV_HEIGHT = 56
/** Match Ant Design `large` controls so search + history icon align on one line. */
const NAV_CONTROL_SIZE = 'large' as const
const DEFAULT_TITLE = BRANDING.name
const PREVIEW_MIN_CHARS = 2
const PREVIEW_LIMIT = 5
const DEBOUNCE_MS = 300
/** Fetch extra rows so after filtering (created / customer reply / edit) we can still show up to 10. */
const ACTIVITY_PEEK_FETCH_LIMIT = 40
const ACTIVITY_PEEK_SHOW = 10

type TicketPreview = {
  id: number
  title: string | null
  companyName: string | null
  priorityTitle: string | null
  priorityColor: string | null
}

/**
 * Top content bar (right column beside the sidebar): app title + ticket search.
 * Preview lists up to 5 tickets (id, title, company, priority); click opens ticket detail.
 * `savedFiltersUserId`: when set (staff/admin), shows saved filter shortcuts next to search.
 */
export default function TicketSearchNavbar({
  savedFiltersUserId,
  navbarUser,
}: {
  savedFiltersUserId?: string | null
  navbarUser: NavbarAccountUser
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const [searchBy] = useState<'all'>('all')
  const [prefOpen, setPrefOpen] = useState(false)
  const [searchPrefs, setSearchPrefs] = useState<{ title: boolean; description: boolean; comments: boolean }>(() => {
    try {
      const saved = localStorage.getItem('ticket-search-prefs')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return { title: true, description: true, comments: false }
  })
  const [preview, setPreview] = useState<TicketPreview[]>([])
  const [panelVisible, setPanelVisible] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const historyLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyWrapRef = useRef<HTMLDivElement>(null)

  const getSearchFields = (prefs: typeof searchPrefs) =>
    Object.entries(prefs).filter(([, v]) => v).map(([k]) => k).join(',') || 'title'

  const [savedPresets, setSavedPresets] = useState<SavedTicketFilterPreset[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ActivityPeekRow[]>([])
  const [historyPos, setHistoryPos] = useState({ top: 56, right: 0 })
  const [appTitle, setAppTitle] = useState(DEFAULT_TITLE)

  useEffect(() => {
    fetch('/api/app-settings')
      .then((r) => r.json())
      .then((d) => { if (d?.app_name) setAppTitle(d.app_name) })
      .catch(() => {})
  }, [])

  const loadHistoryPeek = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch(
        `/api/ticket-activity?limit=${ACTIVITY_PEEK_FETCH_LIMIT}&offset=0`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('fetch failed')
      const body = (await res.json()) as { data?: ActivityPeekRow[] }
      const raw = Array.isArray(body.data) ? body.data : []
      setHistoryRows(raw.filter(isTicketActivityNavbarPeekRow).slice(0, ACTIVITY_PEEK_SHOW))
    } catch {
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!savedFiltersUserId) {
      setSavedPresets([])
      return
    }
    const load = () => setSavedPresets(loadSavedTicketFilterPresets(savedFiltersUserId))
    load()
    window.addEventListener(SAVED_FILTERS_CHANGED_EVENT, load)
    return () => window.removeEventListener(SAVED_FILTERS_CHANGED_EVENT, load)
  }, [savedFiltersUserId])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPanelVisible(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  useEffect(() => {
    return () => {
      if (historyLeaveTimer.current) clearTimeout(historyLeaveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = q.trim()
    if (trimmed.length < PREVIEW_MIN_CHARS) {
      setPreview([])
      setPanelVisible(false)
      setPreviewLoading(false)
      abortRef.current?.abort()
      return
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setPanelVisible(true)
      setPreviewLoading(true)
      setPreview([])
      try {
        const fields = getSearchFields(searchPrefs)
        const res = await fetch(
          `/api/tickets?search=${encodeURIComponent(trimmed)}&search_fields=${encodeURIComponent(fields)}&limit=${PREVIEW_LIMIT}`,
          { credentials: 'include', signal: ac.signal }
        )
        if (!res.ok) throw new Error('fetch failed')
        const data = (await res.json()) as unknown
        const list = Array.isArray(data) ? data : []
        const next: TicketPreview[] = list
          .slice(0, PREVIEW_LIMIT)
          .map((row: unknown) => {
            const r = row as {
              id?: number
              title?: string | null
              company?: { name?: string | null } | null
              priority?: number
            }
            const companyName = r.company?.name?.trim() || null
            const pr = typeof r.priority === 'number' ? r.priority : Number(r.priority)
            const priorityTitle = Number.isFinite(pr) ? `P${pr}` : null
            return {
              id: r.id ?? 0,
              title: r.title ?? '',
              companyName,
              priorityTitle,
              priorityColor: null,
            }
          })
          .filter((r) => r.id > 0)
        setPreview(next)
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
        setPreview([])
        setPanelVisible(false)
      } finally {
        if (!ac.signal.aborted) setPreviewLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q, searchPrefs])

  const applySearch = useCallback(
    (value: string) => {
      setPanelVisible(false)
      const trimmed = value.trim()
      const onTicketList = pathname === '/tickets' || pathname === '/tickets/'
      const fields = getSearchFields(searchPrefs)
      if (onTicketList) {
        const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        if (trimmed) { sp.set('search', trimmed); sp.set('search_fields', fields) }
        else { sp.delete('search'); sp.delete('search_fields') }
        const qs = sp.toString()
        router.push(qs ? `/tickets?${qs}` : '/tickets', { scroll: false })
      } else {
        router.push(trimmed ? `/tickets?search=${encodeURIComponent(trimmed)}&search_fields=${encodeURIComponent(fields)}` : '/tickets')
      }
    },
    [pathname, router, searchPrefs]
  )

  const goTicket = useCallback(
    (id: number) => {
      setPanelVisible(false)
      setQ('')
      setPreview([])
      router.push(`/tickets/${id}`)
    },
    [router]
  )

  const openHistory = useCallback(() => {
    if (historyLeaveTimer.current) {
      clearTimeout(historyLeaveTimer.current)
      historyLeaveTimer.current = null
    }
    if (historyWrapRef.current) {
      const rect = historyWrapRef.current.getBoundingClientRect()
      setHistoryPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    setHistoryOpen(true)
    void loadHistoryPeek()
  }, [loadHistoryPeek])

  const scheduleCloseHistory = useCallback(() => {
    if (historyLeaveTimer.current) clearTimeout(historyLeaveTimer.current)
    historyLeaveTimer.current = setTimeout(() => setHistoryOpen(false), 200)
  }, [])

  return (
    <div
      className="ticket-search-navbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px 0 16px',
        /* Floating bar: same 12px inset + radius family as the sidebar; ends before the ticket side panels. */
        margin: '12px 24px 0 24px',
        marginRight: 'calc(var(--attr-sidebar-width, 0px) + 24px)',
        transition: 'margin-right 0.2s',
        height: NAV_HEIGHT,
        minHeight: NAV_HEIGHT,
        background: 'var(--ticket-nav-bg)',
        border: '1px solid var(--ticket-nav-border)',
        borderRadius: 16,
        boxShadow: 'var(--card-shadow)',
        position: 'sticky',
        top: 12,
        zIndex: 100,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          flexShrink: 0,
        }}
      >
        <SpaNavLink
          href="/dashboard"
          style={{
            fontWeight: 600,
            color: 'var(--ticket-nav-brand)',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          {appTitle}
        </SpaNavLink>
      </div>

      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          flex: 1,
          maxWidth: 520,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
        }}
      >
        {previewLoading && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 300, borderRadius: 1 }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, transparent, #1677ff, #1677ff, transparent)',
              animation: 'navbar-search-progress 1.2s ease-in-out infinite',
              width: '40%',
            }} />
            <style>{`@keyframes navbar-search-progress { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }`}</style>
          </div>
        )}
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size={NAV_CONTROL_SIZE}
            allowClear
            placeholder="Search tickets…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => applySearch(q)}
            onFocus={() => {
              if (q.trim().length >= PREVIEW_MIN_CHARS && (preview.length > 0 || previewLoading)) {
                setPanelVisible(true)
              }
            }}
            style={{ flex: 1 }}
          />
          <Button
            size={NAV_CONTROL_SIZE}
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => applySearch(q)}
          />
          <Popover
            open={prefOpen}
            onOpenChange={setPrefOpen}
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ width: 220 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--ticket-nav-text)' }}>Search in</div>
                {([
                  { key: 'title', label: 'Subject / Title' },
                  { key: 'description', label: 'Description' },
                  { key: 'comments', label: 'Notes & Replies' },
                ] as const).map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ticket-nav-panel-border)' }}>
                    <span style={{ fontSize: 13 }}>{label}</span>
                    <Switch
                      size="small"
                      checked={searchPrefs[key]}
                      onChange={(checked) => {
                        const next = { ...searchPrefs, [key]: checked }
                        setSearchPrefs(next)
                        try { localStorage.setItem('ticket-search-prefs', JSON.stringify(next)) } catch { /* ignore */ }
                        setPreview([])
                      }}
                    />
                  </div>
                ))}
              </div>
            }
          >
            <Button
              size={NAV_CONTROL_SIZE}
              icon={<SettingOutlined />}
            />
          </Popover>
        </Space.Compact>
        {panelVisible && q.trim().length >= PREVIEW_MIN_CHARS && (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              marginTop: 4,
              background: 'var(--ticket-nav-panel-bg)',
              borderRadius: 8,
              boxShadow: '0 4px 12px var(--ticket-nav-shadow)',
              border: '1px solid var(--ticket-nav-panel-border)',
              zIndex: 200,
            }}
          >
            {preview.length > 0 ? (
              preview.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  onClick={() => goTicket(t.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 4,
                    width: '100%',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: '1px solid var(--ticket-nav-panel-row-border)',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                    minWidth: 0,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 8 }}>
                    <span style={{ color: 'var(--ticket-nav-muted)', fontSize: 12, flexShrink: 0 }}>#{t.id}</span>
                    <span
                      style={{
                        color: 'var(--ticket-nav-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.title || '(No title)'}
                    </span>
                  </div>
                  {(t.companyName || t.priorityTitle) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        fontSize: 12,
                        color: '#8c8c8c',
                        minWidth: 0,
                      }}
                    >
                      {t.companyName && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {t.companyName}
                        </span>
                      )}
                      {t.companyName && t.priorityTitle && (
                        <span style={{ color: '#d9d9d9', flexShrink: 0 }} aria-hidden>
                          ·
                        </span>
                      )}
                      {t.priorityTitle && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            flexShrink: 0,
                            maxWidth: '100%',
                          }}
                        >
                          {t.priorityColor ? (
                            <span
                              aria-hidden
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: t.priorityColor,
                                flexShrink: 0,
                              }}
                            />
                          ) : null}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.priorityTitle}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))
            ) : !previewLoading ? (
              <div style={{ padding: 12, color: 'var(--ticket-nav-muted)', fontSize: 13 }}>No tickets found</div>
            ) : (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: 14, borderRadius: 4, background: 'var(--ticket-nav-panel-border)', width: `${70 - i * 10}%`, animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
                    <div style={{ height: 11, borderRadius: 4, background: 'var(--ticket-nav-panel-border)', width: '40%', animation: 'skeleton-pulse 1.4s ease-in-out infinite 0.2s' }} />
                  </div>
                ))}
                <style>{`@keyframes skeleton-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>
              </div>
            )}
            {!previewLoading && preview.length > 0 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPanelVisible(false)
                  router.push(`/tickets?search=${encodeURIComponent(q.trim())}&search_fields=${encodeURIComponent(getSearchFields(searchPrefs))}&view=list`)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  borderTop: '1px solid var(--ticket-nav-panel-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#1677ff',
                  fontWeight: 500,
                }}
              >
                Show all results →
              </button>
            )}
          </div>
        )}
      </div>

      {savedFiltersUserId && savedPresets.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Text style={{ fontSize: 11, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.03, color: 'var(--ticket-nav-muted)' }}>
            My Filters
          </Text>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflowX: 'auto',
              flex: 1,
              minWidth: 0,
              scrollbarWidth: 'thin',
            }}
          >
            {savedPresets.map((p) => (
              <span
                key={p.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  flexShrink: 0,
                  background: 'var(--ticket-nav-filter-bg)',
                  border: '1px solid var(--ticket-nav-filter-border)',
                  borderRadius: 6,
                  padding: '2px 2px 2px 8px',
                  fontSize: 13,
                }}
              >
                <SpaNavLink
                  href={p.query ? `/tickets?${p.query}` : '/tickets'}
                  title={p.name}
                  style={{
                    color: 'var(--ticket-nav-filter-link)',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </SpaNavLink>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    Modal.confirm({
                      title: 'Remove saved filter?',
                      content: `"${p.name}" will be removed from your saved filters.`,
                      okText: 'Remove',
                      okButtonProps: { danger: true },
                      cancelText: 'Cancel',
                      onOk: () => {
                        if (savedFiltersUserId) removeSavedTicketFilterPreset(savedFiltersUserId, p.id)
                      },
                    })
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 4,
                    color: 'var(--ticket-nav-muted)',
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginLeft: 'auto',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          gap: 6,
        }}
      >
        <ThemeToggle variant="ticketNav" placement="bottomRight" />
        <ActiveTimeTrackerNavButton />
        <TicketNotificationBell />

        <div
          ref={historyWrapRef}
          style={{
            position: 'relative',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
          }}
          onMouseEnter={openHistory}
          onMouseLeave={scheduleCloseHistory}
        >
          <button
            type="button"
            aria-label="Ticket activity history"
            onClick={() => router.push('/ticket-activity')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              padding: 0,
              border: '1px solid var(--ticket-nav-icon-btn-border)',
              borderRadius: 8,
              background: 'var(--ticket-nav-icon-btn-bg)',
              color: 'var(--ticket-nav-icon-btn-color)',
              cursor: 'pointer',
            }}
          >
            <HistoryOutlined style={{ fontSize: 18 }} />
          </button>
          {historyOpen && typeof document !== 'undefined' && createPortal(
          <div
            role="menu"
            style={{
              position: 'fixed',
              top: historyPos.top,
              right: historyPos.right,
              width: 380,
              maxWidth: 'calc(100vw - 32px)',
              background: 'var(--ticket-nav-panel-bg)',
              borderRadius: 8,
              boxShadow: '0 4px 12px var(--ticket-nav-shadow)',
              border: '1px solid var(--ticket-nav-panel-border)',
              zIndex: 500,
              overflow: 'hidden',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--ticket-nav-panel-border)',
                fontWeight: 600,
                fontSize: 13,
                color: 'var(--ticket-nav-text)',
              }}
            >
              Recent activity
            </div>
            {historyLoading ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : historyRows.length === 0 ? (
              <div style={{ padding: 14, color: 'var(--ticket-nav-muted)', fontSize: 13 }}>No activity yet</div>
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {historyRows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHistoryOpen(false)
                      router.push(`/tickets/${r.ticket_id}`)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      alignSelf: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      borderBottom: '1px solid var(--ticket-nav-panel-row-border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 13,
                    }}
                  >
                    <TicketActivityActorAvatar
                      size={36}
                      actorRole={r.actor_role}
                      avatarUrl={r.actor?.avatar_url}
                      name={r.actor?.name}
                      email={r.actor?.email}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: 'var(--ticket-nav-muted)', fontSize: 11, marginBottom: 4 }}>
                        #{r.ticket_id} · {r.created_at ? dayjs(r.created_at).fromNow() : '—'}
                      </div>
                      <div style={{ fontWeight: 500, color: 'var(--ticket-nav-text)', marginBottom: 2 }}>
                        {formatTicketActivityNavbarLabel(r.action, r.actor_role)}
                      </div>
                      <div
                        style={{
                          color: 'var(--ticket-nav-text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.ticket_title || '(No title)'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--ticket-nav-panel-border)',
                textAlign: 'center',
              }}
            >
              <SpaNavLink
                href="/ticket-activity"
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--ticket-nav-filter-link)' }}
                onClick={() => setHistoryOpen(false)}
              >
                See all
              </SpaNavLink>
            </div>
          </div>,
          document.body
          )}
        </div>

        <NavbarAccount user={navbarUser} />
      </div>
    </div>
  )
}
