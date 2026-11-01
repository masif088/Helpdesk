'use client'

import { DeleteOutlined, EditOutlined, EnvironmentOutlined, LeftOutlined, LinkOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons'
import { App, Button, DatePicker, Empty, Form, Input, Layout, Modal, Popconfirm, Segmented, Select, Space, Spin, Switch, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { type CalendarItem, summarizeResponses, TYPE_INFO, VISIBILITY_LABELS } from '@/lib/calendar-core'

const { Content } = Layout
const { Title, Text } = Typography

type TypeChoice = { type: string; label: string; color: string; description: string; derived: boolean; default_all_day: boolean; default_visibility: string; can_create: boolean }
type Lookup = { can_create: boolean; types: TypeChoice[]; repeats: string[]; visibilities: string[] }
type Person = { id: string; full_name: string | null; email: string }

type FormValues = {
  type: string
  title: string
  all_day: boolean
  range: [Dayjs, Dayjs]
  visibility: string
  repeat: string
  repeat_until: Dayjs | null
  location: string
  meeting_url: string
  description: string
  attendee_ids: string[]
  company_id: string | null
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3
const dayKey = (d: Dayjs) => d.format('YYYY-MM-DD')

/** The days (YYYY-MM-DD) an item touches: plain dates for all-day items, the viewer's local days for timed ones. */
function daysOf(item: CalendarItem): string[] {
  const first = dayjs(item.start)
  const last = dayjs(item.end)
  const out: string[] = []
  for (let d = first.startOf('day'), n = 0; !d.isAfter(last, 'day') && n < 62; d = d.add(1, 'day'), n++) out.push(dayKey(d))
  return out
}

function timeLabel(item: CalendarItem): string {
  if (item.all_day) return item.start === item.end ? 'All day' : `${dayjs(item.start).format('D MMM')} to ${dayjs(item.end).format('D MMM')}`
  const s = dayjs(item.start)
  const e = dayjs(item.end)
  return s.isSame(e, 'day') ? `${s.format('HH:mm')} to ${e.format('HH:mm')}` : `${s.format('D MMM HH:mm')} to ${e.format('D MMM HH:mm')}`
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  /** `YYYY-MM-DD`: open on this day (links in notifications) */
  initialDate?: string
}

export default function CalendarContent({ user, initialDate }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const start = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && dayjs(initialDate).isValid() ? dayjs(initialDate) : dayjs()
  const [month, setMonth] = useState(() => start.startOf('month'))
  const [selected, setSelected] = useState(() => start)
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [mineOnly, setMineOnly] = useState(false)
  const [editing, setEditing] = useState<{ item: CalendarItem | null; day: Dayjs } | null>(null)
  const [feedOpen, setFeedOpen] = useState(false)

  const gridStart = useMemo(() => month.subtract((month.day() + 6) % 7, 'day'), [month])
  const weeks = Math.ceil(((month.day() + 6) % 7 + month.daysInMonth()) / 7)
  const gridEnd = useMemo(() => gridStart.add(weeks * 7 - 1, 'day'), [gridStart, weeks])

  useEffect(() => {
    fetch('/api/calendar/lookup', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLookup(d))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: dayKey(gridStart), to: dayKey(gridEnd) })
      if (mineOnly) qs.set('user_ids', 'me')
      const res = await fetch(`/api/calendar/events?${qs}`, { credentials: 'include', cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the calendar')
      setItems(body.events)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [gridStart, gridEnd, mineOnly, message])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => items.filter((i) => !hidden.has(i.type)), [items, hidden])
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const i of shown) for (const k of daysOf(i)) m.set(k, [...(m.get(k) ?? []), i])
    return m
  }, [shown])
  const dayItems = byDay.get(dayKey(selected)) ?? []

  const remove = async (item: CalendarItem) => {
    const res = await fetch(`/api/calendar/events/${item.id}`, { method: 'DELETE', credentials: 'include' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return message.error(body.error || 'Could not delete it')
    message.success('Deleted')
    void load()
  }

  const respond = async (item: CalendarItem, response: 'accepted' | 'declined' | 'tentative') => {
    const res = await fetch(`/api/calendar/events/${item.id}/respond`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return message.error(body.error || 'Could not save your answer')
    message.success('Answer saved')
    void load()
  }

  const usedTypes = (lookup?.types ?? []).filter((t) => items.some((i) => i.type === t.type) || !t.derived)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Calendar
              </Title>
              <Text className="page-head__sub">Meetings, leave, holidays, events and due dates in one place</Text>
            </div>
            {lookup?.can_create ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ item: null, day: selected })}>
                Add event
              </Button>
            ) : null}
          </div>

          <div className="cal-toolbar">
            <Space>
              <Button icon={<LeftOutlined />} onClick={() => setMonth((m) => m.subtract(1, 'month'))} aria-label="Previous month" />
              <Button
                onClick={() => {
                  setMonth(dayjs().startOf('month'))
                  setSelected(dayjs())
                }}
              >
                Today
              </Button>
              <Button icon={<RightOutlined />} onClick={() => setMonth((m) => m.add(1, 'month'))} aria-label="Next month" />
              <Title level={4} style={{ margin: '0 0 0 8px' }}>
                {month.format('MMMM YYYY')}
              </Title>
              {loading ? <Spin size="small" /> : null}
            </Space>
            <Space wrap>
              <Button size="small" icon={<LinkOutlined />} onClick={() => setFeedOpen(true)}>
                Subscribe
              </Button>
              {!user.role || user.role.toLowerCase() !== 'customer' ? (
                <label className="cal-mine">
                  <Switch size="small" checked={mineOnly} onChange={setMineOnly} /> Only mine
                </label>
              ) : null}
            </Space>
          </div>

          <div className="cal-legend">
            {usedTypes.map((t) => {
              const off = hidden.has(t.type)
              return (
                <button
                  key={t.type}
                  type="button"
                  className={`cal-legend__item${off ? ' is-off' : ''}`}
                  title={t.description}
                  onClick={() => setHidden((h) => { const n = new Set(h); if (off) n.delete(t.type); else n.add(t.type); return n })}
                >
                  <span className="cal-dot" style={{ background: t.color }} />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className="cal-layout">
            <section className="ticket-surface cal-grid-wrap">
              <div className="cal-grid cal-grid--head">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="cal-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="cal-grid">
                {Array.from({ length: weeks * 7 }, (_, i) => {
                  const d = gridStart.add(i, 'day')
                  const list = byDay.get(dayKey(d)) ?? []
                  const cls = ['cal-cell', d.month() !== month.month() ? 'is-other' : '', d.isSame(dayjs(), 'day') ? 'is-today' : '', d.isSame(selected, 'day') ? 'is-selected' : ''].filter(Boolean).join(' ')
                  return (
                    <div key={i} className={cls} onClick={() => setSelected(d)}>
                      <div className="cal-cell__num">{d.date()}</div>
                      {list.slice(0, MAX_CHIPS).map((it, n) => (
                        <button
                          key={`${it.id}-${n}`}
                          type="button"
                          className="cal-chip"
                          style={{ background: `${it.color}22`, color: it.color, borderColor: `${it.color}55` }}
                          title={`${TYPE_INFO[it.type].label}: ${it.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelected(d)
                          }}
                        >
                          {it.all_day ? '' : `${dayjs(it.start).format('HH:mm')} `}
                          {it.title}
                        </button>
                      ))}
                      {list.length > MAX_CHIPS ? <div className="cal-more">+{list.length - MAX_CHIPS} more</div> : null}
                    </div>
                  )
                })}
              </div>
            </section>

            <aside className="ticket-surface cal-day">
              <div className="cal-day__head">
                <div>
                  <div className="cell-strong">{selected.format('dddd')}</div>
                  <Text type="secondary">{selected.format('D MMMM YYYY')}</Text>
                </div>
                {lookup?.can_create ? (
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setEditing({ item: null, day: selected })}>
                    Add
                  </Button>
                ) : null}
              </div>
              {dayItems.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing on this day" />
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {dayItems.map((it, n) => (
                    <div key={`${it.id}-${n}`} className="cal-entry" style={{ borderLeftColor: it.color }}>
                      <div className="cal-entry__top">
                        <Tag color={it.color} style={{ margin: 0 }}>
                          {TYPE_INFO[it.type].label}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {timeLabel(it)}
                          {it.repeat !== 'none' ? ` · repeats ${it.repeat}` : ''}
                        </Text>
                      </div>
                      <div className="cell-strong">{it.title}</div>
                      {it.description ? <Text type="secondary" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{it.description}</Text> : null}
                      <Space size={12} wrap style={{ fontSize: 12 }}>
                        {it.location ? (
                          <span>
                            <EnvironmentOutlined /> {it.location}
                          </span>
                        ) : null}
                        {it.meeting_url ? (
                          <a href={it.meeting_url} target="_blank" rel="noreferrer">
                            <LinkOutlined /> Join
                          </a>
                        ) : null}
                        {it.source === 'ticket' && it.ticket_id ? <SpaNavLink href={`/tickets/${it.ticket_id}`}>Open ticket</SpaNavLink> : null}
                        {it.source === 'event' && it.ticket_id ? <SpaNavLink href={`/tickets/${it.ticket_id}`}>Ticket #{it.ticket_id}</SpaNavLink> : null}
                        {it.source === 'invoice' ? <SpaNavLink href="/invoices">Invoices</SpaNavLink> : null}
                        {it.visibility ? <Text type="secondary">{VISIBILITY_LABELS[it.visibility]}</Text> : null}
                      </Space>
                      {it.source === 'event' && it.attendee_ids.length > 0 ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {(() => {
                              const s = summarizeResponses(it.attendee_ids, it.responses)
                              return `${it.attendee_ids.length} invited · ${s.accepted} accepted · ${s.tentative} maybe · ${s.declined} declined · ${s.awaiting} waiting`
                            })()}
                          </Text>
                          {it.attendee_ids.includes(user.id) ? (
                            <Segmented
                              size="small"
                              value={it.my_response ?? undefined}
                              onChange={(v) => void respond(it, v as 'accepted' | 'declined' | 'tentative')}
                              options={[{ value: 'accepted', label: 'Accept' }, { value: 'tentative', label: 'Maybe' }, { value: 'declined', label: 'Decline' }]}
                            />
                          ) : null}
                        </div>
                      ) : null}
                      {it.editable ? (
                        <Space size={4}>
                          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing({ item: it, day: selected })}>
                            Edit
                          </Button>
                          <Popconfirm title={it.repeat !== 'none' ? 'Delete the whole series?' : 'Delete this event?'} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => void remove(it)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                              Delete
                            </Button>
                          </Popconfirm>
                        </Space>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>

          {feedOpen ? <FeedModal onClose={() => setFeedOpen(false)} /> : null}

          {editing && lookup ? (
            <EventModal
              lookup={lookup}
              item={editing.item}
              day={editing.day}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                void load()
              }}
            />
          ) : null}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

function EventModal({ lookup, item, day, onClose, onSaved }: { lookup: Lookup; item: CalendarItem | null; day: Dayjs; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const creatable = lookup.types.filter((t) => t.can_create)
  const allDay = Form.useWatch('all_day', form) ?? false
  const repeat = Form.useWatch('repeat', form) ?? 'none'
  const typeNow = Form.useWatch('type', form)

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' }).then((r) => (r.ok ? r.json() : [])).then((d: (Person & { role?: string })[]) => setPeople(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/companies', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { data: [] })).then((d) => setCompanies(d.data ?? [])).catch(() => {})
  }, [])

  const initial = useMemo<Partial<FormValues>>(() => {
    if (item) {
      const range: [Dayjs, Dayjs] = [dayjs(item.start), dayjs(item.end)]
      return { type: item.type, title: item.title, all_day: item.all_day, range, visibility: item.visibility ?? 'staff', repeat: item.repeat, location: item.location ?? '', meeting_url: item.meeting_url ?? '', description: item.description ?? '', attendee_ids: item.attendee_ids, company_id: item.company_id }
    }
    const type = creatable.find((t) => t.type === 'meeting')?.type ?? creatable[0]?.type ?? 'event'
    const info = lookup.types.find((t) => t.type === type)!
    return { type, title: '', all_day: info.default_all_day, range: info.default_all_day ? [day, day] : [day.hour(9).minute(0), day.hour(10).minute(0)], visibility: info.default_visibility, repeat: 'none', attendee_ids: [] }
  }, [item, day, creatable, lookup.types])

  // Picking another type brings that type's usual shape (all-day or timed, who sees it)
  const onType = (type: string) => {
    const info = lookup.types.find((t) => t.type === type)
    if (!info || item) return
    const [s] = form.getFieldValue('range') as [Dayjs, Dayjs]
    form.setFieldsValue({ all_day: info.default_all_day, visibility: info.default_visibility, range: info.default_all_day ? [s, s] : [s.hour(9).minute(0), s.hour(10).minute(0)] })
  }

  const submit = async () => {
    const v = await form.validateFields()
    const [start, end] = v.range
    const body: Record<string, unknown> = {
      type: v.type,
      title: v.title,
      all_day: v.all_day,
      start: v.all_day ? start.format('YYYY-MM-DD') : start.toISOString(),
      end: v.all_day ? end.format('YYYY-MM-DD') : end.toISOString(),
      visibility: v.visibility,
      repeat: v.repeat,
      repeat_until: v.repeat !== 'none' && v.repeat_until ? v.repeat_until.format('YYYY-MM-DD') : null,
      location: v.location || null,
      meeting_url: v.meeting_url || null,
      description: v.description || null,
      attendee_ids: v.attendee_ids ?? [],
      company_id: v.company_id || null,
    }
    setSaving(true)
    try {
      const res = await fetch(item ? `/api/calendar/events/${item.id}` : '/api/calendar/events', { method: item ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save it')
      message.success(item ? 'Saved' : 'Added')
      onSaved()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={item ? 'Edit event' : 'Add event'} onCancel={onClose} onOk={() => void submit()} okText={item ? 'Save' : 'Add'} confirmLoading={saving} width={560} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={initial} requiredMark={false}>
        <Form.Item name="type" label="Type" rules={[{ required: true }]} extra={lookup.types.find((t) => t.type === typeNow)?.description}>
          <Select onChange={onType} options={(item ? lookup.types.filter((t) => !t.derived) : creatable).map((t) => ({ value: t.type, label: t.label }))} />
        </Form.Item>
        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="all_day" valuePropName="checked" style={{ marginBottom: 8 }}>
          <Switch checkedChildren="All day" unCheckedChildren="Timed" />
        </Form.Item>
        <Form.Item name="range" label={allDay ? 'Days' : 'From and to'} rules={[{ required: true, message: 'Pick the dates' }]}>
          {allDay ? <DatePicker.RangePicker style={{ width: '100%' }} /> : <DatePicker.RangePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="D MMM YYYY HH:mm" style={{ width: '100%' }} />}
        </Form.Item>
        <Form.Item name="repeat" label="Repeat">
          <Segmented options={lookup.repeats.map((r) => ({ value: r, label: r === 'none' ? 'No' : r[0].toUpperCase() + r.slice(1) }))} />
        </Form.Item>
        {repeat !== 'none' ? (
          <Form.Item name="repeat_until" label="Repeat until" extra="Empty = for ever">
            <DatePicker />
          </Form.Item>
        ) : null}
        <Form.Item name="visibility" label="Who sees it">
          <Select options={lookup.visibilities.map((v) => ({ value: v, label: VISIBILITY_LABELS[v as keyof typeof VISIBILITY_LABELS] }))} />
        </Form.Item>
        <Form.Item name="attendee_ids" label="People">
          <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Invite people" options={people.map((p) => ({ value: p.id, label: p.full_name || p.email }))} />
        </Form.Item>
        <Form.Item name="company_id" label="Client company" extra="Needed when the event is visible to the client company">
          <Select allowClear showSearch optionFilterProp="label" placeholder="None" options={companies.map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item name="location" label="Place">
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="meeting_url" label="Meeting link" rules={[{ pattern: /^https?:\/\//i, message: 'Start with http:// or https://' }]}>
          <Input placeholder="https://meet.google.com/…" />
        </Form.Item>
        <Form.Item name="description" label="Notes">
          <Input.TextArea rows={3} maxLength={5000} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/** "Subscribe": a secret link that shows this calendar in Google Calendar, Apple Calendar or Outlook, kept up to date by them. */
function FeedModal({ onClose }: { onClose: () => void }) {
  const { message } = App.useApp()
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/calendar/feed', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((d) => setUrl(d.url ?? null))
      .catch(() => setUrl(null))
  }, [])

  const act = async (action: 'reset' | 'disable') => {
    setBusy(true)
    try {
      const res = await fetch('/api/calendar/feed', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'It failed')
      setUrl(data.url ?? null)
      message.success(action === 'disable' ? 'Link switched off' : url ? 'New link made, the old one stopped' : 'Link made')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title="Subscribe to this calendar" onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={560}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Text type="secondary">
          Add your calendar to Google Calendar, Apple Calendar or Outlook with a private link. They keep it up to date by themselves; it shows what you see here (30 days back, 180 days ahead).
        </Text>
        {url === undefined ? <Spin /> : url ? (
          <>
            <Input.TextArea readOnly autoSize value={url} onFocus={(e) => e.target.select()} />
            <Space wrap>
              <Button type="primary" onClick={() => void navigator.clipboard.writeText(url).then(() => message.success('Copied'))}>
                Copy link
              </Button>
              <Popconfirm title="Make a new link?" description="The old link stops working. Subscribe again with the new one." okText="Make new link" onConfirm={() => void act('reset')}>
                <Button loading={busy}>Reset link</Button>
              </Popconfirm>
              <Popconfirm title="Switch the link off?" okText="Switch off" okButtonProps={{ danger: true }} onConfirm={() => void act('disable')}>
                <Button danger loading={busy}>
                  Switch off
                </Button>
              </Popconfirm>
            </Space>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
              <li>
                <b>Google Calendar:</b> Other calendars → + → From URL → paste the link.
              </li>
              <li>
                <b>Apple Calendar:</b> File → New Calendar Subscription → paste the link.
              </li>
              <li>
                <b>Outlook:</b> Add calendar → Subscribe from web → paste the link.
              </li>
            </ul>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Anyone who has the link can see your calendar, so keep it to yourself. Reset it if it gets out. Google can take a few hours to show changes.
            </Text>
          </>
        ) : (
          <Button type="primary" loading={busy} onClick={() => void act('reset')}>
            Make my link
          </Button>
        )}
      </div>
    </Modal>
  )
}
