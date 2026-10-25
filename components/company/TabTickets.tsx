'use client'

import { CalendarOutlined, DeleteOutlined, EditOutlined, FilterOutlined, SearchOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  message,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import { DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useRouter } from 'next/navigation'
import { useCallback,useEffect, useMemo, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'
import { canDeleteTickets } from '@/lib/auth-utils'
import { resolveDefaultNewTicketStatusSlug } from '@/lib/ticket-default-status'
import { ticketStatusDisplayLabel } from '@/lib/ticket-status-kanban'

const { Text } = Typography
const { Option } = Select

interface TabTicketsProps {
  companyData: { id: string; name?: string }
  currentUser?: { id: string; email?: string | null; name?: string | null } | null
  /** Used to hide ticket delete (trash) for non–admin/manager */
  viewerRole?: string | null
  basePath?: string
  onTotalChange?: (total: number) => void
}

interface TicketRecord {
  id: number
  title: string
  description: string | null
  status: string
  type_id: number | null
  priority?: number | null
  company_id: string | null
  due_date: string | null
  created_at: string
  updated_at?: string
  creator_name?: string
  by_label?: string
  team_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  company?: { id: string; name: string; color?: string } | null
  assignees?: Array<{ id: string; user_name?: string }>
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>
  checklist_completed?: number
  checklist_total?: number
  has_unread_replies?: boolean
}

interface StatusOption {
  slug: string
  title: string
  color?: string
  is_active?: boolean
}

interface TypeOption {
  id: number
  title: string
  slug: string
  color: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function TabTickets({ companyData, currentUser, viewerRole, basePath, onTotalChange }: TabTicketsProps) {
  const router = useRouter()
  const canMoveTicketToTrash = canDeleteTickets(viewerRole ?? undefined)
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [types, setTypes] = useState<TypeOption[]>([])
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string }>>([])
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterTypeId, setFilterTypeId] = useState<number | undefined>(undefined)
  const [filterSearch, setFilterSearch] = useState('')
  /** Filter tickets by **created** date (server-side via date_from / date_to API params). */
  const [filterDateRange, setFilterDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [form] = Form.useForm()
  const [syncingEmail, setSyncingEmail] = useState(false)
  const [fixingPriority, setFixingPriority] = useState(false)
  const [filtersDirty, setFiltersDirty] = useState(false)

  const statusOptionsForModal = useMemo(() => {
    const active = statuses.filter((s) => s.is_active !== false)
    const cur = editingTicket?.status
    if (cur && !active.some((s) => s.slug === cur)) {
      const row = statuses.find((s) => s.slug === cur)
      return row ? [...active, row] : active
    }
    return active
  }, [statuses, editingTicket?.status])

  const ticketDetailUrl = (id: number) => (basePath ? `${basePath}/tickets/${id}` : `/tickets/${id}`)

  const handleSyncEmail = async () => {
    setSyncingEmail(true)
    try {
      const res = await fetch('/api/email/sync-inbox', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      const parts = []
      if (data.addedCount > 0) parts.push(`${data.addedCount} reply(ies)`)
      if (data.createdCount > 0) parts.push(`${data.createdCount} new ticket(s)`)
      message.success(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Synced. No new emails.')
      fetchTickets()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to sync email')
    } finally {
      setSyncingEmail(false)
    }
  }

  const fetchTickets = useCallback(async (
    page = currentPage,
    size = pageSize,
    order = sortOrder,
    status = filterStatus,
    typeId = filterTypeId,
    search = filterSearch,
    dateRange = filterDateRange,
  ) => {
    if (!companyData?.id) return
    setLoading(true)
    setFiltersDirty(false)
    try {
      const params = new URLSearchParams()
      params.set('company_id', companyData.id)
      params.set('limit', String(size))
      params.set('offset', String((page - 1) * size))
      params.set('paginated', '1')
      if (status.length > 0) params.set('status', status.join(','))
      if (typeId != null) params.set('type_id', String(typeId))
      params.set('sort_by', 'id')
      params.set('sort_order', order)
      if (search.trim()) params.set('search', search.trim())
      if (dateRange) {
        params.set('date_from', dateRange[0].startOf('day').toISOString())
        params.set('date_to', dateRange[1].endOf('day').toISOString())
      }
      const res = await apiFetch<{ data: TicketRecord[]; total: number }>(`/api/tickets?${params}`)
      const list = Array.isArray(res.data) ? res.data : []
      const t = res.total ?? 0
      setTotal(t)
      onTotalChange?.(t)
      setTickets(
        list.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          type_id: t.type_id,
          priority: typeof t.priority === 'number' ? t.priority : null,
          company_id: t.company_id,
          due_date: t.due_date,
          created_at: t.created_at,
          updated_at: t.updated_at,
          creator_name: t.creator_name,
          by_label: t.by_label,
          team_name: t.team_name,
          type: t.type,
          company: t.company,
          assignees: t.assignees || [],
          tags: t.tags || [],
          checklist_completed: t.checklist_completed ?? 0,
          checklist_total: t.checklist_total ?? 0,
          has_unread_replies: t.has_unread_replies,
        }))
      )
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [companyData?.id, onTotalChange])

  const fetchLookup = async () => {
    try {
      const data = await apiFetch<{
        statuses: Array<{ slug: string; title: string; color?: string; is_active?: boolean }>
        ticketTypes: TypeOption[]
        tags: Array<{ id: string; name: string }>
      }>('/api/tickets/lookup')
      setStatuses(data.statuses || [])
      setTypes(data.ticketTypes || [])
      setAllTags(data.tags || [])
      const slugs = (data.statuses || []).map((s) => s.slug)
      if (slugs.length) {
        setFilterStatus((prev) => (prev.length === 0 ? slugs : prev))
      }
    } catch {
      setStatuses([])
      setTypes([])
      setAllTags([])
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    fetchLookup()
  }, [])

  const statusFilterNarrowed = useMemo(() => {
    if (statuses.length === 0) return false
    if (filterStatus.length === 0) return false
    if (filterStatus.length < statuses.length) return true
    const set = new Set(filterStatus)
    return !statuses.every((s) => set.has(s.slug))
  }, [filterStatus, statuses])

  const hasDateFilter = filterDateRange != null
  const hasActiveFilters =
    statusFilterNarrowed || filterTypeId != null || filterSearch.trim() !== '' || hasDateFilter

  const clearFilters = () => {
    const allSlugs = statuses.map((s) => s.slug)
    setFilterStatus(allSlugs)
    setFilterTypeId(undefined)
    setFilterSearch('')
    setFilterDateRange(null)
    setCurrentPage(1)
    fetchTickets(1, pageSize, sortOrder, allSlugs, undefined, '', null)
  }



  const handleEdit = (ticket: TicketRecord) => {
    setEditingTicket(ticket)
    form.setFieldsValue({
      title: ticket.title,
      description: ticket.description || '',
      status: ticket.status,
      type_id: ticket.type_id ?? undefined,
      company_id: companyData.id,
      due_date: ticket.due_date ? dayjs(ticket.due_date) : null,
    })
    setSelectedTagIds(ticket.tags?.map((t) => t.id) || [])
    setModalVisible(true)
  }

  const handleDelete = async (ticketId: number) => {
    try {
      await apiFetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      message.success('Ticket moved to trash')
      fetchTickets()
    } catch (err: unknown) {
      message.error((err as Error).message || 'Failed to move ticket to trash')
    }
  }

  const handleSubmit = async (values: any) => {
    if (!currentUser) return
    setSaving(true)
    try {
      const defaultStatusSlug = resolveDefaultNewTicketStatusSlug(statuses)

      const payloadEditing: Record<string, unknown> = {
        title: values.title?.trim() || 'Untitled',
        description: values.description || null,
        status: values.status || 'open',
        type_id: values.type_id ?? null,
        company_id: companyData.id,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        tag_ids: selectedTagIds,
      }

      const payloadCreate = {
        title: values.title?.trim() || 'Untitled',
        description: values.description || null,
        status: defaultStatusSlug,
        type_id: values.type_id ?? null,
        company_id: companyData.id,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        tag_ids: selectedTagIds,
      }

      if (editingTicket) {
        await apiFetch(`/api/tickets/${editingTicket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadEditing),
        })
        message.success('Ticket updated')
      } else {
        await apiFetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadCreate),
        })
        message.success('Ticket created')
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedTagIds([])
      fetchTickets()
    } catch (err: unknown) {
      message.error((err as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const getStatusLabel = (status: string) => {
    const s = statuses.find((x) => x.slug === status)
    return s?.title || status.replace('_', ' ')
  }

  const toggleSort = () => {
    const order = sortOrder === 'desc' ? 'asc' : 'desc'
    setSortOrder(order)
    setCurrentPage(1)
    fetchTickets(1, pageSize, order, filterStatus, filterTypeId, filterSearch, filterDateRange)
  }

  const columns: ColumnsType<TicketRecord> = [
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
          onClick={toggleSort}
        >
          # {sortOrder === 'asc' ? '↑' : '↓'}
        </span>
      ),
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: number) => (
        <Button
          type="link"
          size="small"
          onClick={() => router.push(ticketDetailUrl(id))}
          style={{ padding: 0 }}
        >
          #{id}
        </Button>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: TicketRecord) => (
        <Button
          type="link"
          title={title}
          style={{ padding: 0, height: 'auto', fontWeight: 500, maxWidth: '100%', textAlign: 'left', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.4' }}
          onClick={() => router.push(ticketDetailUrl(record.id))}
        >
          {record.has_unread_replies && (
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#ff4d4f',
                marginRight: 6,
                verticalAlign: 'middle',
                flexShrink: 0,
              }}
              title="Unread replies"
            />
          )}
          {title}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const s = statuses.find((x) => x.slug === status)
        const color = s?.color
          ? undefined
          : status === 'resolved' || status === 'closed' || status === 'completed'
            ? 'green'
            : status === 'working_team' || status === 'in_progress'
              ? 'blue'
              : 'default'
        return (
          <Tag color={color} style={s?.color ? { backgroundColor: s.color, borderColor: s.color, color: '#fff' } : undefined}>
            {getStatusLabel(status)}
          </Tag>
        )
      },
    },
    {
      title: 'Type',
      key: 'type',
      width: 120,
      render: (_, r) =>
        r.type ? (
          <Tag color={r.type.color || undefined}>{r.type.title}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Priority',
      key: 'priority',
      width: 80,
      render: (_, r) =>
        r.priority && r.priority > 0 ? (
          <Tag>P{r.priority}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Due date',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 120,
      render: (d: string | null) => (d ? <DateDisplay date={d} /> : '—'),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (d: string) => <DateDisplay date={d} />,
    },
    {
      title: 'By',
      key: 'creator_name',
      width: 120,
      render: (_, r) => <Text type="secondary">{r.by_label || r.creator_name || '—'}</Text>,
    },
    {
      title: 'Assignees',
      key: 'assignees',
      width: 100,
      render: (_, r) =>
        r.assignees && r.assignees.length > 0 ? (
          <Space size={4}>
            <UserOutlined />
            <Text type="secondary">{r.assignees.length}</Text>
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          {canMoveTicketToTrash ? (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Delete ticket?',
                  okText: 'Delete',
                  okButtonProps: { danger: true },
                  onOk: () => handleDelete(record.id),
                })
              }}
            />
          ) : null}
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Row gutter={[16, 8]} align="middle" justify="space-between">
          <Col>
            <Space wrap align="center">
              <FilterOutlined style={{ color: '#8c8c8c' }} />
              <Input
                placeholder="Search by title or description"
                prefix={<SearchOutlined />}
                value={filterSearch}
                onChange={(e) => { setFilterSearch(e.target.value); setFiltersDirty(true) }}
                onPressEnter={() => fetchTickets(1, pageSize, sortOrder, filterStatus, filterTypeId, filterSearch, filterDateRange)}
                onClear={() => { setFilterSearch(''); setFiltersDirty(true) }}
                allowClear
                style={{ width: 260 }}
              />
              <Select
                mode="multiple"
                placeholder="Status (all)"
                allowClear
                value={filterStatus}
                onChange={(v) => { setFilterStatus(v ?? []); setFiltersDirty(true) }}
                style={{ minWidth: 180 }}
                options={statuses.map((s) => ({
                  value: s.slug,
                  label: ticketStatusDisplayLabel(s),
                }))}
                maxTagCount="responsive"
              />
              <Select
                placeholder="Type"
                allowClear
                value={filterTypeId}
                onChange={(v) => { setFilterTypeId(v); setFiltersDirty(true) }}
                style={{ width: 160 }}
              >
                {types.map((t) => (
                  <Option key={t.id} value={t.id}>
                    {t.title}
                  </Option>
                ))}
              </Select>
              <DatePicker.RangePicker
                allowClear
                value={filterDateRange}
                onChange={(dates) => {
                  setFilterDateRange(dates?.[0] && dates?.[1] ? [dates[0], dates[1]] : null)
                  setFiltersDirty(true)
                }}
                format="YYYY-MM-DD"
                placeholder={['Created from', 'Created to']}
                style={{ width: 280 }}
                suffixIcon={<CalendarOutlined />}
              />
              <Button
                type={filtersDirty ? 'primary' : 'default'}
                onClick={() => fetchTickets(1, pageSize, sortOrder, filterStatus, filterTypeId, filterSearch, filterDateRange)}
              >
                Load
              </Button>
              <Button
                loading={fixingPriority}
                onClick={async () => {
                  setFixingPriority(true)
                  try {
                    const res = await apiFetch<{ updated: number }>('/api/tickets/fix-priority', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ company_id: companyData.id }),
                    })
                    message.success(`Priority fixed for ${res.updated} ticket${res.updated !== 1 ? 's' : ''}`)
                    fetchTickets(currentPage, pageSize, sortOrder, filterStatus, filterTypeId, filterSearch, filterDateRange)
                  } catch (err: unknown) {
                    message.error((err as Error).message || 'Failed to fix priority')
                  } finally {
                    setFixingPriority(false)
                  }
                }}
              >
                Fix Priority
              </Button>
              {basePath && (
                <Button icon={<SyncOutlined />} onClick={handleSyncEmail} loading={syncingEmail}>
                  Sync Email
                </Button>
              )}
              {hasActiveFilters && (
                <Button type="link" size="small" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </Space>
            {hasActiveFilters && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Showing {total} ticket{total !== 1 ? 's' : ''}
                {hasDateFilter ? ' (created in selected range)' : ''}
              </Text>
            )}
          </Col>
          <Col>
            {/* {currentUser && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Create Ticket
              </Button>
            )} */}
          </Col>
        </Row>

        <Spin spinning={false}>
          <Table
            size="small"
            loading={loading}
            columns={columns}
            dataSource={tickets}
            rowKey="id"
            onChange={(_, __, sorter) => {
              const s = Array.isArray(sorter) ? sorter[0] : sorter
              if (s?.columnKey === 'id') {
                // cycle: ascend → descend → ascend (no unset)
                const order = s.order === 'ascend' ? 'asc' : 'desc'
                setSortOrder(order)
                setCurrentPage(1)
                fetchTickets(1, pageSize, order, filterStatus, filterTypeId, filterSearch, filterDateRange)
              }
            }}
            pagination={{
              current: currentPage,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['25', '50', '100', '200', '500'],
              showTotal: (t) => `Total ${t} tickets`,
              onChange: (page, size) => {
                setCurrentPage(page)
                setPageSize(size)
                fetchTickets(page, size, sortOrder, filterStatus, filterTypeId, filterSearch, filterDateRange)
              },
            }}
            locale={{ emptyText: 'No tickets for this company' }}
          />
        </Spin>
      </Space>

      <Modal
        title={editingTicket ? 'Edit Ticket' : 'Create Ticket'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
        }}
        footer={null}
        width={600}
        centered
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
            <Input placeholder="Ticket title" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <CommentWysiwyg ticketId={editingTicket?.id} placeholder="Description" height="50px" />
          </Form.Item>
          {editingTicket ? (
            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select>
                {statusOptionsForModal.map((s) => (
                  <Option key={s.slug} value={s.slug}>
                    {s.title}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          ) : null}
          <Form.Item name="type_id" label="Type">
            <Select placeholder="Select type" allowClear>
              {types.map((t) => (
                <Option key={t.id} value={t.id}>
                  <Space>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: t.color,
                      }}
                    />
                    {t.title}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          {!basePath && (
            <Form.Item label="Tags">
              <Select
                mode="multiple"
                placeholder="Select tags"
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                allowClear
              >
                {allTags.map((t) => (
                  <Option key={t.id} value={t.id}>
                    {t.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="due_date" label="Due Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                {editingTicket ? 'Update' : 'Create'}
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false)
                  form.resetFields()
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
