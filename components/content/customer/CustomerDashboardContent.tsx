'use client'

import {
  CheckCircleOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  MessageOutlined,
  PlusOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Dropdown, Empty, Layout, Row, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'

import { LazyCustomerDashboardBarBlock } from '@/components/dashboard/CustomerDashboardChartsLazy'
import DashboardAnnouncementsSection from '@/components/dashboard/DashboardAnnouncementsSection'
import { greeting, KpiCard, SectionTitle } from '@/components/dashboard/DashboardBits'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { canDeleteTickets } from '@/lib/auth-utils'
import { formatMoney } from '@/lib/billing-rate'
import { kanbanTagStyle } from '@/lib/kanban-tag-chip-style'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

const DEFAULT_COLORS = ['#1890ff', '#eb2f96', '#faad14', '#52c41a', '#13c2c2', '#722ed1']

const RECHARTS_TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--ticket-nav-panel-bg)',
  border: '1px solid var(--ticket-nav-panel-border)',
  borderRadius: 8,
  color: 'var(--foreground)',
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--customer-dash-subtle-border)',
  color: 'inherit',
}

const ELLIPSIS: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

type Money = { currency: string; amount: number }

const moneyText = (items: Money[]) => (items.length ? items.map((m) => formatMoney(m.amount, m.currency)).join(' + ') : formatMoney(0, 'IDR'))

/** Statuses where the team waits for the client (same list as the API) */
const AWAITING_STATUSES = 'question,client_review'

interface DashboardData {
  company_id: string | null
  my_tickets_count: number
  active_count: number
  tickets_by_type: Array<{ type_title: string; type_id: number | null; count: number; color: string }>
  status_counts: Array<{ status_slug: string; status_title: string; count: number; color: string }>
  recent_tickets: Array<{
    id: number
    title: string
    due_date: string | null
    updated_at: string
    status_title: string
    status_color: string
    is_active: boolean
    priority: number | null
    creator_name: string | null
  }>
  monthly_summary?: {
    this_month_completed: number
    last_month_completed: number
  }
  awaiting_count: number
  awaiting_response?: Array<{ id: number; title: string; status: string; updated_at: string }>
  /** Portal admin only */
  billing: { deposit_balance: Money[]; unpaid_invoices: Money[]; unpaid_count: number; overdue_count: number } | null
  recent_team_updates?: Array<{ ticket_id: number; ticket_title: string; comment: string; author_name: string | null; created_at: string }>
}

interface CustomerDashboardContentProps {
  user: {
    id: string
    email?: string | null
    name?: string | null
    role?: string
    user_metadata?: { full_name?: string; avatar_url?: string }
  }
}

function ticketsHref(params: Record<string, string>) {
  return `/tickets?${new URLSearchParams({ view: 'list', ...params }).toString()}`
}

/** Customer home: what needs their reply, what the team did lately, and their tickets at a glance. */
export default function CustomerDashboardContent({ user }: CustomerDashboardContentProps) {
  const { message, modal } = App.useApp()
  const router = useRouter()
  const canMoveTicketToTrash = canDeleteTickets(user.role)
  const sidebarUser = { ...user, role: user.role ?? undefined }
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/dashboard', { credentials: 'include' })
      if (res.ok) setData(await res.json())
    } catch {
      /* keep current data */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openStatuses = useMemo(
    () => (data?.status_counts ?? []).filter((s) => s.count > 0 && !isClosedLikeTicketStatus(s.status_slug)),
    [data?.status_counts]
  )
  const statusBySlug = useMemo(() => new Map((data?.status_counts ?? []).map((s) => [s.status_slug, s])), [data?.status_counts])

  const barChartData = useMemo(
    () =>
      (data?.tickets_by_type ?? []).map((t, i) => ({
        name: t.type_title,
        count: t.count,
        fill: t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        type_id: t.type_id,
      })),
    [data?.tickets_by_type]
  )

  const moveToTrash = (id: number) =>
    modal.confirm({
      title: 'Move ticket to trash?',
      content: 'The ticket will be moved to trash instead of being removed.',
      okText: 'Move to trash',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE', credentials: 'include' })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err?.error || 'Failed to move to trash')
          }
          message.success('Ticket moved to trash')
          void load()
        } catch (err) {
          message.error((err as Error).message || 'Failed to move ticket to trash')
        }
      },
    })

  const firstName = (user.user_metadata?.full_name || user.name || user.email || '').split(/[\s@]/)[0]
  const awaiting = data?.awaiting_response ?? []
  const awaitingCount = data?.awaiting_count ?? awaiting.length
  const billing = data?.billing ?? null
  const depositLabel = billing ? moneyText(billing.deposit_balance) : ''
  const updates = data?.recent_team_updates ?? []
  const recent = data?.recent_tickets ?? []
  const summary = data?.monthly_summary

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={sidebarUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={sidebarUser} style={{ overflow: 'hidden' }}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {dayjs().format('dddd, D MMMM YYYY')}
              </Text>
              <Title level={2} style={{ margin: 0, letterSpacing: '-0.02em' }}>
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </Title>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/tickets?new=1')}>
              New ticket
            </Button>
          </div>

          <DashboardAnnouncementsSection />

          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              {billing && billing.overdue_count > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={`${billing.overdue_count} invoice${billing.overdue_count > 1 ? 's are' : ' is'} past the due date`}
                  action={
                    <Button size="small" onClick={() => router.push('/my-company?tab=billing')}>
                      View billing
                    </Button>
                  }
                />
              ) : null}
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} xl={6}>
                  <KpiCard
                    icon={<InboxOutlined />}
                    tone="teal"
                    label="Open tickets"
                    value={data?.active_count ?? 0}
                    hint="Being worked on or waiting"
                    href={openStatuses.length ? ticketsHref({ status: openStatuses.map((s) => s.status_slug).join(',') }) : '/tickets'}
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <KpiCard
                    icon={<MessageOutlined />}
                    tone="amber"
                    label="Waiting for your reply"
                    value={awaitingCount}
                    hint={awaitingCount ? 'The team needs your answer' : 'Nothing needs your answer'}
                    href={awaitingCount ? ticketsHref({ status: AWAITING_STATUSES }) : undefined}
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <KpiCard
                    icon={<CheckCircleOutlined />}
                    tone="green"
                    label="Completed this month"
                    value={summary?.this_month_completed ?? 0}
                    hint={`${summary?.last_month_completed ?? 0} last month`}
                  />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  {billing ? (
                    <KpiCard
                      icon={<WalletOutlined />}
                      tone="slate"
                      label="Deposit balance"
                      value={<span style={{ fontSize: depositLabel.length > 14 ? 20 : 26 }}>{depositLabel}</span>}
                      hint={billing.unpaid_count ? `${moneyText(billing.unpaid_invoices)} in ${billing.unpaid_count} unpaid invoice${billing.unpaid_count > 1 ? 's' : ''}` : 'No unpaid invoices'}
                      href="/my-company?tab=billing"
                    />
                  ) : (
                    <KpiCard icon={<FolderOpenOutlined />} tone="slate" label="All tickets" value={data?.my_tickets_count ?? 0} hint="Open and finished" href="/tickets" />
                  )}
                </Col>
              </Row>

              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={12}>
                  <Card
                    title={
                      <SectionTitle extra={awaitingCount ? <Tag color="orange" style={{ marginInlineEnd: 0 }}>{awaitingCount}</Tag> : null}>
                        Waiting for your reply
                      </SectionTitle>
                    }
                    style={{ height: '100%' }}
                    styles={{ body: { paddingTop: 8 } }}
                  >
                    {awaiting.length ? (
                      awaiting.map((t) => {
                        const s = statusBySlug.get(t.status)
                        return (
                          <Link key={t.id} href={`/tickets/${t.id}`} style={ROW_STYLE}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, ...ELLIPSIS }}>
                                #{t.id} {t.title}
                              </div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Updated {dayjs(t.updated_at).fromNow()}
                              </Text>
                            </div>
                            <Tag style={{ flexShrink: 0, marginInlineEnd: 0, ...kanbanTagStyle({ fillHex: s?.color }) }}>{s?.status_title ?? t.status}</Tag>
                          </Link>
                        )
                      })
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing is waiting for you" />
                    )}
                    {awaitingCount > awaiting.length ? (
                      <Link href={ticketsHref({ status: AWAITING_STATUSES })} style={{ display: 'block', paddingTop: 10, fontSize: 12 }}>
                        +{awaitingCount - awaiting.length} more
                      </Link>
                    ) : null}
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card title={<SectionTitle>Latest replies from the team</SectionTitle>} style={{ height: '100%' }} styles={{ body: { paddingTop: 8 } }}>
                    {updates.length ? (
                      updates.map((u, i) => (
                        <Link key={i} href={`/tickets/${u.ticket_id}`} style={{ ...ROW_STYLE, alignItems: 'flex-start' }}>
                          <span
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              flexShrink: 0,
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: 12,
                              fontWeight: 700,
                              background: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary)',
                            }}
                          >
                            {(u.author_name ?? '?').trim().charAt(0).toUpperCase() || '?'}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, ...ELLIPSIS }}>
                              <Text strong>{u.author_name ?? 'The team'}</Text> <Text type="secondary">on</Text> #{u.ticket_id} {u.ticket_title}
                            </div>
                            <Text type="secondary" style={{ fontSize: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {u.comment}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {dayjs(u.created_at).fromNow()}
                            </Text>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No replies from the team yet" />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={14}>
                  <Card
                    title={
                      <SectionTitle extra={<Link href="/tickets" style={{ fontSize: 12, fontWeight: 400 }}>View all</Link>}>
                        Your tickets
                      </SectionTitle>
                    }
                    style={{ height: '100%' }}
                    styles={{ body: { paddingTop: 8 } }}
                  >
                    {recent.length ? (
                      recent.map((t) => {
                        const overdue = t.due_date ? !dayjs(t.due_date).startOf('day').isAfter(dayjs().startOf('day')) : false
                        return (
                          <Link key={t.id} href={`/tickets/${t.id}`} style={{ ...ROW_STYLE, opacity: t.is_active ? 1 : 0.65 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, ...ELLIPSIS }}>
                                #{t.id} {t.title}
                              </div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {t.creator_name ? `${t.creator_name} · ` : ''}updated {dayjs(t.updated_at).fromNow()}
                                {t.due_date && t.is_active ? (
                                  <span style={overdue ? { color: '#DC2626', fontWeight: 600 } : undefined}> · due {dayjs(t.due_date).format('D MMM')}</span>
                                ) : null}
                              </Text>
                            </div>
                            {t.priority != null && t.priority > 0 ? <Tag style={{ marginInlineEnd: 0, ...kanbanTagStyle({ neutral: true }) }}>P{t.priority}</Tag> : null}
                            <Tag style={{ flexShrink: 0, marginInlineEnd: 0, ...kanbanTagStyle({ fillHex: t.status_color }) }}>{t.status_title}</Tag>
                            {canMoveTicketToTrash ? (
                              <span onClick={(e) => e.preventDefault()}>
                                <Dropdown
                                  trigger={['click']}
                                  menu={{ items: [{ key: 'trash', label: 'Move to trash', icon: <DeleteOutlined />, danger: true, onClick: () => moveToTrash(t.id) }] }}
                                >
                                  <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label="Ticket actions" />
                                </Dropdown>
                              </span>
                            ) : null}
                          </Link>
                        )
                      })
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets yet">
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/tickets?new=1')}>
                          Create your first ticket
                        </Button>
                      </Empty>
                    )}
                  </Card>
                </Col>
                <Col xs={24} xl={10}>
                  <Card title={<SectionTitle>Tickets by type and status</SectionTitle>} style={{ height: '100%' }}>
                    {barChartData.length ? (
                      <div className="customer-dash-recharts" style={{ height: 200 }}>
                        <LazyCustomerDashboardBarBlock
                          barChartData={barChartData}
                          tooltipStyle={RECHARTS_TOOLTIP_STYLE}
                          onBarTypeClick={(typeId) => router.push(ticketsHref({ type_ids: String(typeId) }))}
                        />
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets yet" />
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {(data?.status_counts ?? [])
                        .filter((s) => s.count > 0)
                        .map((s) => (
                          <Link key={s.status_slug} href={ticketsHref({ status: s.status_slug })}>
                            <Tag style={{ marginInlineEnd: 0, cursor: 'pointer', ...kanbanTagStyle({ fillHex: s.color }) }}>
                              {s.status_title} · {s.count}
                            </Tag>
                          </Link>
                        ))}
                    </div>
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
