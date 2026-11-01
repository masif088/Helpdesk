'use client'

import { ClockCircleOutlined, HistoryOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Button, Drawer, Empty, Input, Layout, message, Select, Switch, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import RowActions from '@/components/settings/RowActions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { Chip } from '@/components/ticket/list/TicketChips'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { normalizeSpecificDates } from '@/lib/recurring-ticket-schedule'

import RecurringTicketRunsDrawer from './RecurringTicketRunsDrawer'

dayjs.extend(relativeTime)


export interface RecurringTicketRow {
  id: string
  title: string
  description: string | null
  frequency: string
  specificDays: number[] | null
  specificDate: number | number[] | null
  intervalDays: number | null
  timeOfDay: string
  timezone: string
  startDate: string
  endDate: string | null
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  ticketStatus: string | null
  ticketPriority: number | null
  teamId: string | null
  companyId: string | null

  ticketTypeId: number | null
  contactUserId: string | null
  assigneeIds: string[]
  createdAt: string
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays (Mon–Fri)',
  weekends: 'Weekends (Sat–Sun)',
  specific_days: 'Specific days',
  specific_date: 'Monthly date',
  interval: 'Every N days',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function freqLabel(row: RecurringTicketRow): string {
  switch (row.frequency) {
    case 'specific_days':
      return `Every ${(row.specificDays ?? []).map((d) => DAY_NAMES[d]).join(', ')}`
    case 'specific_date': {
      const dates = normalizeSpecificDates(row.specificDate)
      if (dates.length === 0) return 'Monthly'
      if (dates.length === 1) return `Monthly on day ${dates[0]}`
      return `Monthly on days ${dates.join(', ')}`
    }
    case 'interval':
      return `Every ${row.intervalDays ?? 1} day(s)`
    default:
      return FREQ_LABELS[row.frequency] ?? row.frequency
  }
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function RecurringTicketsContent({ user }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<RecurringTicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [filterCompany, setFilterCompany] = useState<string | undefined>(undefined)
  const [filterTitle, setFilterTitle] = useState('')
  const [runsDrawer, setRunsDrawer] = useState<RecurringTicketRow | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recurring-tickets')
      const json = await res.json()
      setRows(json.data ?? [])
    } catch {
      messageApi.error('Failed to load recurring tickets')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchRules()
    fetch('/api/companies', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setCompanies(j?.data ?? []))
      .catch(() => {})
  }, [fetchRules])

  const handleToggle = async (row: RecurringTicketRow, active: boolean) => {
    setToggling(row.id)
    try {
      const res = await fetch(`/api/recurring-tickets/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      })
      if (!res.ok) throw new Error()
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: active } : r)))
      messageApi.success(active ? 'Rule activated' : 'Rule paused')
    } catch {
      messageApi.error('Failed to update status')
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (row: RecurringTicketRow) => {
    const res = await fetch(`/api/recurring-tickets/${row.id}`, { method: 'DELETE' })
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      messageApi.success('Deleted')
    } else {
      messageApi.error('Failed to delete')
    }
  }



  const handleRunNow = async (row: RecurringTicketRow) => {
    setRunning(row.id)
    try {
      const res = await fetch(`/api/recurring-tickets/${row.id}/run-now`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      messageApi.success(`Ticket created successfully`)
      fetchRules()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Failed to run')
    } finally {
      setRunning(null)
    }
  }

  const columns: ColumnsType<RecurringTicketRow> = [
    {
      title: 'Ticket',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, row: RecurringTicketRow) => {
        const p = row.ticketPriority && row.ticketPriority > 0 ? row.ticketPriority : null
        return (
          <div style={{ minWidth: 0 }}>
            <span className="cell-strong">{text}</span>
            {p ? <span className="cell-order" style={{ marginLeft: 8 }}>P{p}</span> : null}
            {row.description ? (
              <div className="cell-muted" style={{ fontSize: 12 }}>
                {row.description.slice(0, 90)}
                {row.description.length > 90 ? '…' : ''}
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      title: 'Schedule',
      key: 'frequency',
      width: 220,
      render: (_: unknown, row: RecurringTicketRow) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <Chip color="#0F9D8A">
            <ClockCircleOutlined /> {freqLabel(row)}
          </Chip>
          <span className="cell-muted" style={{ fontSize: 12 }}>
            {row.timeOfDay} · {row.timezone}
          </span>
        </span>
      ),
    },
    {
      title: 'Next run',
      key: 'nextRunAt',
      width: 130,
      render: (_: unknown, row: RecurringTicketRow) => {
        if (!row.isActive) return <span className="cell-muted">Paused</span>
        if (!row.nextRunAt) return <span className="cell-muted">—</span>
        const d = dayjs(row.nextRunAt)
        return (
          <Tooltip title={d.format('YYYY-MM-DD HH:mm')}>
            <span className="cell-strong">{d.fromNow()}</span>
          </Tooltip>
        )
      },
    },
    {
      title: 'Last run',
      key: 'lastRunAt',
      width: 130,
      render: (_: unknown, row: RecurringTicketRow) =>
        row.lastRunAt ? (
          <Tooltip title={dayjs(row.lastRunAt).format('YYYY-MM-DD HH:mm')}>
            <span className="cell-muted">{dayjs(row.lastRunAt).fromNow()}</span>
          </Tooltip>
        ) : (
          <span className="cell-muted">Never</span>
        ),
    },
    {
      title: 'Active',
      key: 'isActive',
      width: 90,
      render: (_: unknown, row: RecurringTicketRow) => (
        <Switch size="small" checked={row.isActive} loading={toggling === row.id} onChange={(v) => handleToggle(row, v)} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 150,
      align: 'right',
      render: (_: unknown, row: RecurringTicketRow) => (
        <RowActions
          extra={
            <>
              <Tooltip title="Run now: create the ticket immediately">
                <Button type="text" size="small" icon={<ThunderboltOutlined />} loading={running === row.id} onClick={() => handleRunNow(row)} aria-label="Run now" />
              </Tooltip>
              <Tooltip title="Run history">
                <Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => setRunsDrawer(row)} aria-label="Run history" />
              </Tooltip>
            </>
          }
          onEdit={() => router.push(`/settings/recurring-tickets/${row.id}/edit`)}
          onDelete={() => handleDelete(row)}
          deleteTitle="Delete this recurring ticket?"
          deleteDescription="Tickets it already created stay."
        />
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <div className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Recurring tickets"
            description="Tickets created automatically on a schedule"
            count={`${rows.length} rules`}
            actions={
              <>
                <Tooltip title="Refresh">
                  <Button icon={<ReloadOutlined />} onClick={fetchRules} loading={loading} aria-label="Refresh" />
                </Tooltip>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/settings/recurring-tickets/new')}>
                  New recurring ticket
                </Button>
              </>
            }
          />
          <div className="page-toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search by title…"
              style={{ width: 240 }}
              value={filterTitle}
              onChange={(e) => setFilterTitle(e.target.value)}
            />
            <Select
              allowClear
              showSearch
              placeholder="All companies"
              style={{ width: 200 }}
              value={filterCompany}
              onChange={setFilterCompany}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          <div className="ticket-surface ticket-table">
          <Table
            dataSource={rows.filter((r) => {
              if (filterCompany && r.companyId !== filterCompany) return false
              if (filterTitle && !r.title.toLowerCase().includes(filterTitle.toLowerCase())) return false
              return true
            })}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
              showTotal: appTableShowTotal('rules'),
            }}
            locale={{ emptyText: <Empty description="No recurring tickets yet" /> }}
          />
          </div>
        </div>


        <Drawer
          open={!!runsDrawer}
          onClose={() => setRunsDrawer(null)}
          title={runsDrawer ? `Run history — ${runsDrawer.title}` : 'Run history'}
          width={520}
          destroyOnHidden
        >
          {runsDrawer && <RecurringTicketRunsDrawer ruleId={runsDrawer.id} />}
        </Drawer>
      </AdminMainColumn>
    </Layout>
  )
}
