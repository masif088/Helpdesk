'use client'

import 'react-quill-new/dist/quill.snow.css'

import { Button, Checkbox, Col, DatePicker, Divider, Form, Input, InputNumber, message, Popover, Row, Select, Spin, Tag, TimePicker, Typography } from 'antd'
import dayjs from 'dayjs'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { useSession } from '@/lib/auth-client'
import { normalizeSpecificDates } from '@/lib/recurring-ticket-schedule'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

const { Title, Text } = Typography

const TEMPLATE_VARS = [
  { var: '{{ this_month_name }}', example: 'September' },
  { var: '{{ prev_month_name }}', example: 'August' },
  { var: '{{ next_month_name }}', example: 'October' },
  { var: '{{ this_day_name }}', example: 'Thursday' },
  { var: '{{ prev_day_name }}', example: 'Wednesday' },
  { var: '{{ next_day_name }}', example: 'Friday' },
  { var: '{{ this_date }}', example: '2026-09-25' },
  { var: '{{ prev_date }}', example: '2026-09-24' },
  { var: '{{ next_date }}', example: '2026-09-26' },
  { var: '{{ this_year }}', example: '2026' },
  { var: '{{ this_month_number }}', example: '9' },
  { var: '{{ this_day_number }}', example: '25' },
]

function TemplateVarHint() {
  return (
    <Popover
      title="Available template variables"
      trigger="click"
      content={
        <div style={{ maxWidth: 340 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            Use these in Title or Description — they are replaced when the ticket is created.
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEMPLATE_VARS.map(({ var: v, example }) => (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag style={{ fontFamily: 'monospace', fontSize: 11, margin: 0 }}>{v}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>→ {example}</Text>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <Text style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', userSelect: 'none' }}>
        {'{ } available variables'}
      </Text>
    </Popover>
  )
}

const DAY_OPTIONS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
]

const DATE_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  label: String(i + 1),
  value: i + 1,
}))

const COMMON_TIMEZONES = [
  'UTC', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Bangkok',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Australia/Sydney',
]

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
}

const QUILL_FORMATS = ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'indent', 'link']

interface OptionItem { label: string; value: string | number }

export interface RecurringTicketFormValues {
  id?: string
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
  companyId: string | null
  teamId: string | null
  ticketTypeId: number | string | null
  contactUserId: string | null
  assigneeIds: string[]
}

interface Props {
  initialValues: RecurringTicketFormValues | null
}

export default function RecurringTicketFormPage({ initialValues }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const sessionUser = session?.user as { id?: string; name?: string | null; email?: string | null; role?: string } | undefined
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [description, setDescription] = useState<string>(initialValues?.description ?? '')
  const frequency = Form.useWatch('frequency', form)
  const isEdit = !!initialValues

  const [companies, setCompanies] = useState<OptionItem[]>([])
  const [teams, setTeams] = useState<OptionItem[]>([])
  const [ticketTypes, setTicketTypes] = useState<OptionItem[]>([])
  const [statuses, setStatuses] = useState<OptionItem[]>([])
  const [contacts, setContacts] = useState<OptionItem[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/companies').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/teams').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/ticket-types').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/ticket-statuses').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/users?limit=500').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([comp, team, types, sts, allUsr]) => {
      setCompanies((comp.data ?? comp ?? []).map((c: { id: string; name: string }) => ({ label: c.name, value: c.id })))
      setTeams((team.data ?? team ?? []).map((t: { id: string; name: string }) => ({ label: t.name, value: t.id })))
      const typesArr = Array.isArray(types) ? types : (types.data ?? [])
      setTicketTypes(typesArr.map((t: { id: number | string; title?: string; name?: string; slug?: string }) => ({ label: t.title ?? t.name ?? t.slug ?? String(t.id), value: t.id })))
      const stsArr = Array.isArray(sts) ? sts : (sts.data ?? [])
      setStatuses(stsArr.filter((s: { is_active?: boolean }) => s.is_active !== false).map((s: { id?: number; slug?: string; title?: string; name?: string }) => ({ label: s.title ?? s.name ?? s.slug ?? '', value: s.slug ?? String(s.id ?? '') })))
      setContacts((allUsr.data ?? allUsr ?? []).map((u: { id: string; full_name?: string; first_name?: string; last_name?: string; email?: string }) => ({
        label: `${(u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '')} ${u.email ? `(${u.email})` : ''}`.trim(),
        value: u.id,
      })))
    }).finally(() => setLoadingOptions(false))
  }, [])

  useEffect(() => {
    if (initialValues) {
      const dates = normalizeSpecificDates(initialValues.specificDate)
      setDescription(initialValues.description ?? '')
      form.setFieldsValue({
        title: initialValues.title,
        frequency: initialValues.frequency,
        specific_days: initialValues.specificDays ?? [],
        specific_date: dates.length ? dates : [1],
        interval_days: initialValues.intervalDays ?? 2,
        time_of_day: dayjs(initialValues.timeOfDay, 'HH:mm'),
        timezone: initialValues.timezone,
        start_date: dayjs(initialValues.startDate),
        end_date: initialValues.endDate ? dayjs(initialValues.endDate) : null,
        ticket_status: initialValues.ticketStatus ?? 'open',
        ticket_priority: initialValues.ticketPriority || null,
        company_id: initialValues.companyId ?? null,
        team_id: initialValues.teamId ?? null,
        ticket_type_id: initialValues.ticketTypeId ?? null,
        contact_user_id: initialValues.contactUserId ?? null,
        assignee_ids: Array.isArray(initialValues.assigneeIds) && initialValues.assigneeIds.length > 0 ? initialValues.assigneeIds[0] : null,
      })
    } else {
      form.setFieldsValue({
        frequency: 'daily',
        specific_days: [],
        specific_date: [1],
        interval_days: 2,
        time_of_day: dayjs('08:00', 'HH:mm'),
        timezone: 'Asia/Jakarta',
        start_date: dayjs(),
        ticket_status: 'open',
        ticket_priority: null,
      })
    }
  }, [initialValues, form])

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const body = {
        title: values.title,
        description: description || null,
        frequency: values.frequency,
        specific_days: values.frequency === 'specific_days' ? values.specific_days : null,
        specific_date: values.frequency === 'specific_date' ? normalizeSpecificDates(values.specific_date) : null,
        interval_days: values.frequency === 'interval' ? values.interval_days : null,
        time_of_day: (values.time_of_day as dayjs.Dayjs).format('HH:mm'),
        timezone: values.timezone,
        start_date: (values.start_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        end_date: values.end_date ? (values.end_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        ticket_status: values.ticket_status || 'open',
        ticket_priority: values.ticket_priority || null,
        company_id: values.company_id || null,
        team_id: values.team_id || null,
        ticket_type_id: values.ticket_type_id || null,
        contact_user_id: values.contact_user_id || null,
        assignee_ids: values.assignee_ids ? [values.assignee_ids] : [],
      }

      const url = isEdit ? `/api/recurring-tickets/${initialValues!.id}` : '/api/recurring-tickets'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to save')
      }

      message.success(isEdit ? 'Updated' : 'Created')
      router.push('/settings/recurring-tickets')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar user={{ id: sessionUser?.id ?? '', email: sessionUser?.email, name: sessionUser?.name, role: sessionUser?.role }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={{ id: sessionUser?.id ?? '', email: sessionUser?.email, name: sessionUser?.name, role: sessionUser?.role }}>
        <style>{`
          .rt-quill-wrapper .ql-toolbar { border-radius: 6px 6px 0 0; }
          .rt-quill-wrapper .ql-container { border-radius: 0 0 6px 6px; min-height: 160px; }
          .rt-quill-wrapper .ql-editor { min-height: 160px; }
        `}</style>
        <div className="settings-page" style={{ padding: 24, maxWidth: 920 }}>
          <BackLink href="/settings/recurring-tickets" style={{ marginBottom: 12 }}>
            Recurring tickets
          </BackLink>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                {isEdit ? 'Edit recurring ticket' : 'New recurring ticket'}
              </Title>
              <Text className="page-head__sub">
                {isEdit ? `Editing: ${initialValues?.title}` : 'A ticket that is created automatically on a schedule.'}
              </Text>
            </div>
          </div>

          {loadingOptions ? (
            <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
          ) : (
            <Form form={form} layout="vertical" onFinish={handleSubmit} className="settings-form">

              <Form.Item
                name="title"
                label={<span>Title <TemplateVarHint /></span>}
                rules={[{ required: true, message: 'Title is required' }]}
              >
                <Input placeholder="e.g. {{ this_month_name }} Monthly Maintenance" size="large" />
              </Form.Item>

              <Form.Item label={<span>Description <TemplateVarHint /></span>}>
                <div className="rt-quill-wrapper" style={{ background: '#fff', borderRadius: 6 }}>
                  <ReactQuill
                    theme="snow"
                    value={description}
                    onChange={setDescription}
                    modules={QUILL_MODULES}
                    formats={QUILL_FORMATS}
                    placeholder="Optional ticket description — template variables supported"
                  />
                </div>
              </Form.Item>

              <Divider titlePlacement="start" orientationMargin={0}>
                <Text type="secondary" style={{ fontSize: 12 }}>Schedule</Text>
              </Divider>

              <Form.Item name="frequency" label="Frequency" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="daily">Every day</Select.Option>
                  <Select.Option value="weekdays">Weekdays (Mon–Fri)</Select.Option>
                  <Select.Option value="weekends">Weekends (Sat–Sun)</Select.Option>
                  <Select.Option value="specific_days">Specific days of the week</Select.Option>
                  <Select.Option value="specific_date">Specific dates each month</Select.Option>
                  <Select.Option value="interval">Every N days</Select.Option>
                </Select>
              </Form.Item>

              {frequency === 'specific_days' && (
                <Form.Item name="specific_days" label="Days"
                  rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one day' }]}>
                  <Checkbox.Group options={DAY_OPTIONS} />
                </Form.Item>
              )}
              {frequency === 'specific_date' && (
                <Form.Item name="specific_date" label="Days of month (1–31)"
                  rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one date' }]}>
                  <Select mode="multiple" placeholder="Select one or more days"
                    options={DATE_OPTIONS} optionFilterProp="label" maxTagCount="responsive" style={{ width: '100%' }} />
                </Form.Item>
              )}
              {frequency === 'interval' && (
                <Form.Item name="interval_days" label="Every how many days" rules={[{ required: true }]}>
                  <InputNumber min={1} max={365} style={{ width: 140 }} addonAfter="days" />
                </Form.Item>
              )}

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="time_of_day" label="Time of day" rules={[{ required: true }]}>
                    <TimePicker format="HH:mm" style={{ width: '100%' }} minuteStep={15} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="timezone" label="Timezone" rules={[{ required: true }]}>
                    <Select showSearch>
                      {COMMON_TIMEZONES.map((tz) => (
                        <Select.Option key={tz} value={tz}>{tz}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="start_date" label="Start date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="end_date" label="End date (optional)">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider titlePlacement="start" orientationMargin={0}>
                <Text type="secondary" style={{ fontSize: 12 }}>Ticket Assignment</Text>
              </Divider>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="company_id" label="Company">
                    <Select allowClear showSearch placeholder="Select company"
                      optionFilterProp="label" options={companies} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="contact_user_id" label="Contact (email replies)"
                    tooltip="Recurring ticket notifications are sent to this user's email">
                    <Select allowClear showSearch placeholder="Search by name or email"
                      optionFilterProp="label" options={contacts} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="team_id" label="Team">
                    <Select allowClear showSearch placeholder="Select team"
                      optionFilterProp="label" options={teams} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="assignee_ids" label="Assignee">
                    <Select allowClear showSearch placeholder="Search by name or email"
                      optionFilterProp="label" options={contacts} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="ticket_type_id" label="Ticket type">
                    <Select allowClear showSearch placeholder="Select type"
                      optionFilterProp="label" options={ticketTypes} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ticket_status" label="Default status">
                    <Select allowClear showSearch placeholder="open"
                      optionFilterProp="label"
                      options={statuses.length ? statuses : [{ label: 'Open', value: 'open' }]} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider titlePlacement="start" orientationMargin={0}>
                <Text type="secondary" style={{ fontSize: 12 }}>Ticket Settings</Text>
              </Divider>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="ticket_priority" label="Priority (1=highest, blank=lowest)">
                    <InputNumber min={1} placeholder="Lowest" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <div className="settings-form__footer">
                <Button onClick={() => router.push('/settings/recurring-tickets')}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={saving}>
                  {isEdit ? 'Save changes' : 'Create recurring ticket'}
                </Button>
              </div>
            </Form>
          )}
        </div>
      </AdminMainColumn>
    </div>
  )
}
