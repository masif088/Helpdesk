'use client'

import {
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  InboxOutlined,
  RobotOutlined,
  SettingOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Flex,
  Modal,
  Popover,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import { useRouter } from 'next/navigation'
import type { Key } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { KANBAN_SEMANTIC_BLUE, kanbanTagStyle } from '@/lib/kanban-tag-chip-style'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import type { StatusColumn, TicketRecord, TicketSortField, TicketSortOrder } from './types'
import {
  sortTickets,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
} from './types'

type ColKey = 'company' | 'priority' | 'type' | 'tags' | 'due_date' | 'team' | 'status'

const ALL_COL_KEYS: ColKey[] = ['company', 'priority', 'type', 'tags', 'due_date', 'team', 'status']
const COL_LABELS: Record<ColKey, string> = {
  company: 'Company', priority: 'Priority', type: 'Type',
  tags: 'Tags', due_date: 'Due date', team: 'Team', status: 'Status',
}
const LS_KEY = 'tickets_list_col_config'

interface ColConfig { order: ColKey[]; hidden: ColKey[] }

const CUSTOMER_HIDDEN_COLS: ColKey[] = ['company', 'team']

function readColConfig(isCustomer = false): ColConfig {
  const defaultHidden = isCustomer ? [...CUSTOMER_HIDDEN_COLS] : []
  try {
    const key = isCustomer ? `${LS_KEY}_customer` : LS_KEY
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ColConfig>
      const order = (parsed.order ?? ALL_COL_KEYS).filter((k): k is ColKey => ALL_COL_KEYS.includes(k as ColKey))
      const hidden = (parsed.hidden ?? defaultHidden).filter((k): k is ColKey => ALL_COL_KEYS.includes(k as ColKey))
      return { order, hidden }
    }
  } catch { /* ignore */ }
  return { order: [...ALL_COL_KEYS], hidden: defaultHidden }
}

interface TicketsListViewProps {
  tickets: TicketRecord[]
  allStatusColumns: StatusColumn[]
  isCustomer?: boolean
  filterTicketType?: 'spam' | 'trash' | null
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onBulkMoveToSpam?: (ids: number[]) => void | Promise<void>
  onBulkMoveToTrash?: (ids: number[]) => void | Promise<void>
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
}

export default function TicketsListView({
  tickets,
  allStatusColumns,
  isCustomer = false,
  filterTicketType = null,
  canDeleteTicket = false,
  onEdit,
  onDelete,
  onBulkMoveToSpam,
  onBulkMoveToTrash,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
}: TicketsListViewProps) {
  const router = useRouter()

  const [pagination, setPagination] = useState(() => {
    try {
      const raw = sessionStorage.getItem('tickets_list_page')
      if (raw) return JSON.parse(raw) as { current: number; pageSize: number }
    } catch { /* ignore */ }
    return { current: 1, pageSize: 15 }
  })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const lsKey = isCustomer ? `${LS_KEY}_customer` : LS_KEY
  const [colConfig, setColConfig] = useState<ColConfig>(() => readColConfig(isCustomer))
  const [colPopoverOpen, setColPopoverOpen] = useState(false)
  const dragKey = useRef<ColKey | null>(null)

  const saveColConfig = useCallback((cfg: ColConfig) => {
    setColConfig(cfg)
    try { localStorage.setItem(lsKey, JSON.stringify(cfg)) } catch { /* ignore */ }
  }, [lsKey])

  const toggleCol = useCallback((key: ColKey) => {
    setColConfig((prev) => {
      const hidden = prev.hidden.includes(key)
        ? prev.hidden.filter((k) => k !== key)
        : [...prev.hidden, key]
      const next = { ...prev, hidden }
      try { localStorage.setItem(lsKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [lsKey])

  const sortedTickets = useMemo(
    () => sortTickets(tickets, sortBy, sortOrder),
    [tickets, sortBy, sortOrder]
  )

  const effectivePagination = useMemo(() => {
    const totalListPages = Math.max(1, Math.ceil(sortedTickets.length / pagination.pageSize))
    return pagination.current > totalListPages ? { ...pagination, current: totalListPages } : pagination
  }, [sortedTickets.length, pagination])

  useEffect(() => {
    try { sessionStorage.setItem('tickets_list_page', JSON.stringify(effectivePagination)) } catch { /* ignore */ }
  }, [effectivePagination])

  const bulkEnabled = !isCustomer && (onBulkMoveToSpam || onBulkMoveToTrash)
  const inSpamFolder = filterTicketType === 'spam'
  const inTrashFolder = filterTicketType === 'trash'
  const selectedIds = selectedRowKeys.map((k) => Number(k)).filter((n) => !Number.isNaN(n))

  const runBulkSpam = () => {
    if (!onBulkMoveToSpam || selectedIds.length === 0) return
    Modal.confirm({
      title: 'Move to spam',
      content: `Mark ${selectedIds.length} ticket(s) as spam? Open Spam from the sidebar to review or move them to trash.`,
      okText: 'Move to spam',
      cancelText: 'Cancel',
      onOk: async () => {
        await onBulkMoveToSpam(selectedIds)
        setSelectedRowKeys([])
      },
    })
  }

  const runBulkTrash = () => {
    if (!onBulkMoveToTrash || selectedIds.length === 0) return
    Modal.confirm({
      title: 'Move to trash',
      content: `Move ${selectedIds.length} ticket(s) to trash? You can open Trash from the sidebar to review or restore.`,
      okText: 'Move to trash',
      cancelText: 'Cancel',
      onOk: async () => {
        await onBulkMoveToTrash(selectedIds)
        setSelectedRowKeys([])
      },
    })
  }

  const allColDefs = useMemo(() => ({
    company: {
      title: 'Company', dataIndex: ['company', 'name'], key: 'company', ellipsis: true,
      render: (_: unknown, record: TicketRecord) =>
        record.company ? (
          <span
            style={{ color: onFilterByCompany ? '#1677ff' : undefined, cursor: onFilterByCompany ? 'pointer' : undefined, textDecoration: onFilterByCompany ? 'underline' : undefined }}
            title={onFilterByCompany ? 'Filter by this company' : undefined}
            onClick={onFilterByCompany ? (e) => { e.stopPropagation(); onFilterByCompany(record.company!.id) } : undefined}
          >{record.company.name}</span>
        ) : '—',
    },
    priority: {
      title: 'Priority', key: 'priority', width: 100, align: 'center' as const,
      render: (_: unknown, record: TicketRecord) =>
        record.priority != null && record.priority > 0
          ? <Tag style={kanbanTagStyle({ neutral: true })}>P{record.priority}</Tag>
          : '—',
    },
    type: {
      title: 'Type', key: 'type', width: 140,
      render: (_: unknown, record: TicketRecord) =>
        record.type
          ? <Tag style={kanbanTagStyle({ ...(record.type.color ? { fillHex: record.type.color } : { neutral: true }) })}>{record.type.title}</Tag>
          : '—',
    },
    tags: {
      title: 'Tags', key: 'tags', width: 300,
      render: (_: unknown, record: TicketRecord) =>
        record.tags?.length ? (
          <Flex gap={6} wrap="wrap">
            {record.tags.map((t) => (
              <Tag key={t.id}
                style={kanbanTagStyle({ ...(t.color ? { fillHex: t.color } : { neutral: true }), cursor: onFilterByTag ? 'pointer' : undefined })}
                title={onFilterByTag ? 'Filter by this tag' : undefined}
                onClick={onFilterByTag ? (e) => { e.stopPropagation(); onFilterByTag(t.id) } : undefined}
              >{t.name}</Tag>
            ))}
          </Flex>
        ) : '—',
    },
    due_date: {
      title: 'Due date', dataIndex: 'due_date', key: 'due_date', width: 200,
      render: (_: unknown, record: TicketRecord) =>
        record.due_date ? (
          <span style={{ fontWeight: 700, fontSize: 11, color: new Date(record.due_date) < new Date() && !isClosedLikeTicketStatus(record.status) ? '#ff4d4f' : '#8c8c8c' }}>
            {new Date(record.due_date).toLocaleDateString()}
          </span>
        ) : '—',
    },
    team: {
      title: 'Team', key: 'team', width: 160, ellipsis: true,
      render: (_: unknown, record: TicketRecord) =>
        record.team_name
          ? <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_BLUE })}>{record.team_name}</Tag>
          : '—',
    },
    status: {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (status: string, record: TicketRecord) => {
        const col = allStatusColumns.find((c) => c.id === status)
        if (!col) return status
        return (
          <Tag
            style={kanbanTagStyle({ fillHex: col.color, cursor: onFilterByStatus ? 'pointer' : undefined })}
            title={onFilterByStatus ? 'Filter by this status' : undefined}
            onClick={onFilterByStatus ? (e) => { e.stopPropagation(); onFilterByStatus(record.status) } : undefined}
          >{col.title}</Tag>
        )
      },
    },
  }), [allStatusColumns, onFilterByCompany, onFilterByStatus, onFilterByTag])

  const colPopoverContent = (
    <div style={{ width: 200 }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Drag to reorder · toggle to show/hide
      </div>
      {colConfig.order.map((key) => (
        <div
          key={key}
          draggable
          onDragStart={() => { dragKey.current = key }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!dragKey.current || dragKey.current === key) return
            const from = dragKey.current
            setColConfig((prev) => {
              const order = [...prev.order]
              const fi = order.indexOf(from)
              const ti = order.indexOf(key)
              if (fi < 0 || ti < 0) return prev
              order.splice(fi, 1)
              order.splice(ti, 0, from)
              const next = { ...prev, order }
              try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
              return next
            })
            dragKey.current = null
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', cursor: 'grab', userSelect: 'none' }}
        >
          <HolderOutlined style={{ color: '#bbb', fontSize: 13 }} />
          <span style={{ flex: 1, fontSize: 13 }}>{COL_LABELS[key]}</span>
          <Switch
            size="small"
            checked={!colConfig.hidden.includes(key)}
            onChange={() => toggleCol(key)}
          />
        </div>
      ))}
      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8, paddingTop: 8 }}>
        <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
          onClick={() => saveColConfig({ order: [...ALL_COL_KEYS], hidden: [] })}>
          Reset to default
        </Button>
      </div>
    </div>
  )

  return (
    <div style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" style={{ padding: '0 24px 8px' }}>
        {bulkEnabled && selectedIds.length > 0 ? (
          <Flex align="center" wrap="wrap" gap={8}>
            <span style={{ color: 'var(--ant-color-text-secondary, #8c8c8c)', fontSize: 13 }}>
              {selectedIds.length} selected
            </span>
            {!inSpamFolder && onBulkMoveToSpam ? (
              <Button type="default" icon={<WarningOutlined />} onClick={runBulkSpam}>Move to spam</Button>
            ) : null}
            {!inTrashFolder && onBulkMoveToTrash ? (
              <Button type="default" icon={<InboxOutlined />} onClick={runBulkTrash}>Move to trash</Button>
            ) : null}
          </Flex>
        ) : <div />}
        <Popover
          content={colPopoverContent}
          trigger="click"
          open={colPopoverOpen}
          onOpenChange={setColPopoverOpen}
          placement="bottomRight"
        >
          <Button size="small" icon={<SettingOutlined />}>Columns</Button>
        </Popover>
      </Flex>
    <Table
      rowKey="id"
      dataSource={sortedTickets}
      scroll={{ x: 'max-content' }}
      style={{ width: '100%', paddingRight: 24, paddingLeft: 24 }}
      rowSelection={
        bulkEnabled
          ? {
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              columnWidth: 40,
            }
          : undefined
      }
      pagination={{
        current: effectivePagination.current,
        pageSize: effectivePagination.pageSize,
        total: sortedTickets.length,
        showSizeChanger: true,
        pageSizeOptions: ['10', '15', '20', '50'],
        showTotal: (t) => `Total ${t} tickets`,
        onChange: (page, ps) =>
          setPagination((prev) => ({ current: page, pageSize: ps ?? prev.pageSize })),
        onShowSizeChange: (_page, size) => setPagination({ current: 1, pageSize: size }),
      }}
      size="middle"
      columns={[
        { title: '#', dataIndex: 'id', key: 'id', width: 72, align: 'center', render: (id: number) => <span style={{ color: '#8c8c8c', fontWeight: 500 }}>#{id}</span> },
        {
          title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true,
          render: (title: string, record: TicketRecord) => (
            <a href={`/tickets/${record.id}`} style={{ cursor: 'pointer', color: '#1677ff', padding: 0, height: 'auto', textDecoration: 'underline' }}
              onClick={(e) => { if (e.button !== 0 || e.ctrlKey || e.metaKey) return; e.preventDefault(); router.push(`/tickets/${record.id}`) }}>
              {record.has_unread_replies && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />}
              {title && title.length > 50 ? title.slice(0, 50) + '...' : title}
              {record.created_via === 'recurring' && <SyncOutlined title="Created by recurring ticket" style={{ fontSize: 11, color: '#0E7490', marginLeft: 6, verticalAlign: 'middle' }} />}
              {record.created_via === 'automation' && <RobotOutlined title="Created by automation" style={{ fontSize: 11, color: '#0E7490', marginLeft: 6, verticalAlign: 'middle' }} />}
              {!isCustomer && record.short_note && <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2, lineHeight: 1.3 }}>{record.short_note}</div>}
            </a>
          ),
        },
        ...colConfig.order
          .filter((k) => !colConfig.hidden.includes(k))
          .map((k) => allColDefs[k]),
        {
          title: '', key: 'actions', width: 80,
          render: (_: unknown, record: TicketRecord) => (
            <Space>
              <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} /></Tooltip>
              {canDeleteTicket ? (
                <Tooltip title="Move to trash">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => Modal.confirm({ title: 'Move ticket to trash?', content: 'The ticket will be hidden from the main list. You can open Trash from the sidebar to review.', okText: 'Move to trash', okButtonProps: { danger: true }, cancelText: 'Cancel', onOk: () => onDelete(record.id) })}
                  />
                </Tooltip>
              ) : null}
            </Space>
          ),
        },
      ]}
    />
  </div>
)
}
