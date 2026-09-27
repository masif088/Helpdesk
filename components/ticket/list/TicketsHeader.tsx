'use client'

import { AppstoreOutlined, FilterOutlined, IdcardOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, TeamOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, ConfigProvider, Flex, Input, Popover, Segmented, Select, Space, Switch, theme, Tooltip, Typography } from 'antd'
import { useState } from 'react'

import { isTicketFolder, TICKET_FOLDER_LABELS, type TicketFolder } from '@/lib/ticket-classification'
import { TICKET_SCOPE_LABELS, type TicketScope } from '@/lib/ticket-scope'
import { TICKETS_PAGE_LIMIT_OPTIONS, type TicketsPageLimit } from '@/lib/tickets-list-query'

type ViewMode = 'kanban' | 'list' | 'card' | 'roundrobin'

interface TicketsHeaderProps {
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  onCreateClick: () => void
  loading?: boolean
  isCustomer?: boolean
  filterSearch?: string
  onFilterSearchChange?: (v: string) => void
  onCommitSearch?: (v: string) => void
  searchFields?: string
  onSearchFieldsChange?: (v: string) => void
  filterTicketType?: TicketFolder | null
  /** Inbox / My tickets (staff) */
  filterScope?: TicketScope | null
  ticketsPageLimit?: TicketsPageLimit
  onTicketsPageLimitChange?: (v: TicketsPageLimit) => void
  onRefresh?: () => void
  /** Filter panel toggle (panel is hidden when closed) */
  filtersOpen?: boolean
  onToggleFilters?: () => void
  hasActiveFilters?: boolean
}

const SEARCH_FIELD_OPTIONS = [
  { key: 'title', label: 'Subject / Title' },
  { key: 'description', label: 'Description' },
  { key: 'comments', label: 'Notes & Replies' },
] as const

export default function TicketsHeader({
  viewMode,
  onViewModeChange,
  onCreateClick,
  loading = false,
  isCustomer = false,
  filterSearch = '',
  onFilterSearchChange,
  onCommitSearch,
  searchFields = 'title,description',
  onSearchFieldsChange,
  filterTicketType = null,
  filterScope = null,
  ticketsPageLimit = 50,
  onTicketsPageLimitChange,
  onRefresh,
  filtersOpen = false,
  onToggleFilters,
  hasActiveFilters = false,
}: TicketsHeaderProps) {
  const { token } = theme.useToken()
  const searchPending = loading && !!filterSearch.trim()
  const [prefOpen, setPrefOpen] = useState(false)

  const fieldsSet = new Set(searchFields.split(',').map((s) => s.trim()).filter(Boolean))

  function handleViewModeChange(v: ViewMode) {
    if ((v === 'kanban' || v === 'roundrobin') && filterSearch.trim()) {
      onFilterSearchChange?.('')
      onCommitSearch?.('')
    }
    onViewModeChange(isCustomer && v === 'roundrobin' ? 'kanban' : (v as ViewMode))
  }

  function handleFieldToggle(key: string, checked: boolean) {
    const next = new Set(fieldsSet)
    if (checked) next.add(key)
    else next.delete(key)
    const val = Array.from(next).join(',') || 'title'
    onSearchFieldsChange?.(val)
    try { localStorage.setItem('ticket-search-prefs', JSON.stringify(Object.fromEntries(SEARCH_FIELD_OPTIONS.map(f => [f.key, next.has(f.key)])))) } catch { /* ignore */ }
  }

  /** Folder pages (spam / trash / notifications / inbox): card only, no view switcher */
  const inJunkFolder = !isCustomer && (isTicketFolder(filterTicketType) || filterScope === 'inbox')
  const junkTitle = isTicketFolder(filterTicketType) ? TICKET_FOLDER_LABELS[filterTicketType] : null
  const viewOptions = [
    { label: <span style={{ marginRight: 8 }}><AppstoreOutlined /> Kanban</span>, value: 'kanban' },
    ...(!isCustomer ? [{ label: <span style={{ marginRight: 8 }}><TeamOutlined /> Round Robin</span>, value: 'roundrobin' }] : []),
    { label: <span style={{ marginRight: 8 }}><UnorderedListOutlined /> List</span>, value: 'list' },
    { label: <span style={{ marginRight: 8 }}><IdcardOutlined /> Card</span>, value: 'card' },
  ]

  return (
    <div style={{ position: 'relative' }}>
      {searchPending && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, overflow: 'hidden', zIndex: 10 }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, transparent, #1677ff, #1677ff, transparent)',
            animation: 'ticket-search-progress 1.2s ease-in-out infinite',
            width: '40%',
          }} />
          <style>{`@keyframes ticket-search-progress { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }`}</style>
        </div>
      )}
      <Flex vertical gap={12} style={{ padding: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {junkTitle ?? (filterScope ? TICKET_SCOPE_LABELS[filterScope] : isCustomer ? 'My Tickets' : 'All tickets')}
        </Typography.Title>
        {!inJunkFolder && filterScope === 'mine' ? (
          <Typography.Text type="secondary" style={{ marginTop: -8 }}>
            Open tickets assigned to you.
          </Typography.Text>
        ) : null}

        {!inJunkFolder && (
          <Flex align="center" justify="space-between" gap={12} wrap="wrap">
            <Flex align="center" gap={12} wrap="wrap">
              <ConfigProvider theme={{ components: { Segmented: { trackBg: token.colorBgContainer, itemSelectedBg: '#0F9D8A', itemSelectedColor: '#fff' } } }}>
                <Segmented
                  value={isCustomer && viewMode === 'roundrobin' ? 'kanban' : viewMode}
                  onChange={(v) => handleViewModeChange(v as ViewMode)}
                  options={viewOptions}
                  size="middle"
                  style={{ border: '1px solid var(--ant-color-border)' }}
                />
              </ConfigProvider>
              {(viewMode === 'list' || viewMode === 'card') && (
                <Space.Compact>
                  <Input
                    placeholder="Search tickets..."
                    allowClear
                    value={filterSearch}
                    onChange={(e) => onFilterSearchChange?.(e.target.value)}
                    onPressEnter={() => onCommitSearch?.(filterSearch)}
                    style={{ width: 280 }}
                  />
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    loading={searchPending}
                    onClick={() => onCommitSearch?.(filterSearch)}
                  />
                  <Popover
                    open={prefOpen}
                    onOpenChange={setPrefOpen}
                    trigger="click"
                    placement="bottomRight"
                    content={
                      <div style={{ width: 210 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Search in</div>
                        {SEARCH_FIELD_OPTIONS.map(({ key, label }) => (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ant-color-border)' }}>
                            <span style={{ fontSize: 13 }}>{label}</span>
                            <Switch size="small" checked={fieldsSet.has(key)} onChange={(c) => handleFieldToggle(key, c)} />
                          </div>
                        ))}
                      </div>
                    }
                  >
                    <Button
                      icon={<SettingOutlined />}
                    />
                  </Popover>
                </Space.Compact>
              )}
              {onTicketsPageLimitChange && (viewMode === 'kanban' || viewMode === 'roundrobin') && (
                <Flex align="center" gap={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Load</Typography.Text>
                  <Select
                    value={ticketsPageLimit}
                    onChange={(v) => onTicketsPageLimitChange(v as TicketsPageLimit)}
                    options={TICKETS_PAGE_LIMIT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                    style={{ width: 72 }}
                    aria-label="Tickets per load"
                  />
                </Flex>
              )}
              {onRefresh && (
                <Tooltip title="Refresh tickets">
                  <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading} size="middle" />
                </Tooltip>
              )}
            </Flex>
            <Flex gap={8} align="center">
              <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick} loading={loading}>
                Add Ticket
              </Button>
              {onToggleFilters && (
                <Tooltip title={filtersOpen ? 'Hide filters' : hasActiveFilters ? 'Filters applied — show' : 'Show filters'}>
                  <button
                    type="button"
                    className={`filters-toggle${filtersOpen ? ' is-open' : ''}${hasActiveFilters ? ' has-filters' : ''}`}
                    onClick={onToggleFilters}
                    aria-pressed={filtersOpen}
                  >
                    <FilterOutlined />
                    <span>Filters</span>
                    {hasActiveFilters && <span className="filters-toggle__dot" aria-label="filters applied" />}
                  </button>
                </Tooltip>
              )}
            </Flex>
          </Flex>
        )}

        {inJunkFolder && onRefresh && (
          <Flex>
            <Tooltip title="Refresh tickets">
              <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading} size="middle" />
            </Tooltip>
          </Flex>
        )}
      </Flex>
    </div>
  )
}
