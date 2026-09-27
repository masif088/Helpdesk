'use client'

import { Button, Col, Divider, Form, Input, InputNumber, Layout, message, Row, Select, Spin, Switch, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import ActionBuilder from '@/components/automation/ActionBuilder'
import ConditionBuilder from '@/components/automation/ConditionBuilder'
import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { AutomationActions } from '@/lib/automation-actions-types'
import type { OurConditionGroup } from '@/lib/condition-builder-utils'

const { Content } = Layout
const { Title, Text } = Typography

const LIST_HREF = '/settings/automation-rules'

export const AUTOMATION_EVENT_OPTIONS = [
  { value: 'ticket_created', label: 'Ticket created' },
  { value: 'ticket_updated', label: 'Ticket updated' },
  { value: 'ticket_reply_added', label: 'New reply (thread / email / client note)' },
  { value: 'ticket_note_added', label: 'New internal note' },
  { value: 'ticket_comment_added', label: 'New reply or note (any)' },
  { value: 'time_trigger', label: 'Time trigger (daily check)' },
]

interface AutomationRuleRecord {
  id: number
  name: string | null
  event_type: string
  conditions: object
  actions: object
  priority: number
  company_id: string | null
  status: boolean
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

function hasAtLeastOneAction(actions: AutomationActions | object): boolean {
  if (!actions || typeof actions !== 'object') return false
  return Object.values(actions).some((v) => {
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  })
}

const emptyConditions: OurConditionGroup = { operator: 'AND', conditions: [] }

interface Props {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null } }
  /** Rule to edit; absent = create */
  ruleId?: number
}

/** Create / edit an automation rule on its own page (the form is too big for a modal). */
export default function AutomationRuleFormPage({ user, ruleId }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm()
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(!!ruleId)
  const [notFound, setNotFound] = useState(false)
  const [ruleName, setRuleName] = useState<string | null>(null)
  /** Values the form mounts with (set once; the Form renders only after they are known) */
  const [initialValues, setInitialValues] = useState<Record<string, unknown> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isEdit = ruleId !== undefined

  useEffect(() => {
    apiFetch<{ data: { id: string; name: string }[] }>('/api/companies')
      .then((res) => setCompanies(res?.data || []))
      .catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    if (!isEdit) {
      setInitialValues({ event_type: 'ticket_created', priority: 0, status: true, conditions: emptyConditions, actions: {} })
      return
    }
    // No single-rule endpoint: the list is small
    apiFetch<AutomationRuleRecord[]>('/api/automation-rules')
      .then((rows) => {
        const r = rows.find((x) => x.id === ruleId)
        if (!r) {
          setNotFound(true)
          return
        }
        const cond = r.conditions as OurConditionGroup
        setInitialValues({
          name: r.name,
          event_type: r.event_type,
          priority: r.priority,
          company_id: r.company_id || undefined,
          status: r.status,
          conditions: cond && typeof cond === 'object' && Array.isArray(cond.conditions) ? cond : emptyConditions,
          actions: r.actions && typeof r.actions === 'object' ? r.actions : {},
        })
        setRuleName(r.name)
      })
      .catch((e: Error) => message.error(e.message || 'Failed to load rule'))
      .finally(() => setLoading(false))
  }, [isEdit, ruleId])

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name ? String(values.name).trim() : null,
        event_type: String(values.event_type || 'ticket_created'),
        conditions: values.conditions && typeof values.conditions === 'object' ? values.conditions : {},
        actions: values.actions && typeof values.actions === 'object' ? values.actions : {},
        priority: Number(values.priority) || 0,
        company_id: values.company_id || null,
        status: values.status !== false,
      }
      await apiFetch(isEdit ? `/api/automation-rules/${ruleId}` : '/api/automation-rules', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      message.success(isEdit ? 'Rule updated' : 'Rule created')
      router.push(LIST_HREF)
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save rule')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <BackLink href={LIST_HREF} style={{ marginBottom: 12 }}>
            Automation rules
          </BackLink>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                {isEdit ? 'Edit automation rule' : 'New automation rule'}
              </Title>
              <Text className="page-head__sub">
                {isEdit && ruleName ? ruleName : 'When a ticket matches the conditions, apply the actions.'}
              </Text>
            </div>
          </div>

          {loading || (!notFound && !initialValues) ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : notFound ? (
            <div className="tpl-empty">This rule no longer exists.</div>
          ) : (
            <Form form={form} layout="vertical" onFinish={handleSubmit} className="settings-form" initialValues={initialValues ?? undefined}>
              <Divider titlePlacement="start">Rule</Divider>
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item name="name" label="Name">
                    <Input placeholder="e.g. Refund requests to Billing" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="event_type" label="When" rules={[{ required: true }]}>
                    <Select
                      showSearch
                      filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={AUTOMATION_EVENT_OPTIONS}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="company_id" label="Applies to">
                    <Select
                      allowClear
                      showSearch
                      filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                      placeholder="All companies"
                      options={companies.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6} lg={3}>
                  <Form.Item name="priority" label="Priority" tooltip="Higher runs first; every matching rule runs">
                    <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6} lg={3}>
                  <Form.Item name="status" label="Active" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item noStyle shouldUpdate={(a, b) => a.event_type !== b.event_type}>
                {({ getFieldValue }) =>
                  getFieldValue('event_type') === 'time_trigger' ? (
                    <div className="billing-note" style={{ marginBottom: 16 }}>
                      Checked once a day (06:00) for open support tickets idle for at least a day. Use the condition
                      “Days since last updated”. Each rule fires once per ticket until the ticket is updated again.
                    </div>
                  ) : null
                }
              </Form.Item>

              <Divider titlePlacement="start">Conditions</Divider>
              <Form.Item
                validateTrigger="onSubmit"
                name="conditions"
                rules={[
                  {
                    validator: (_, v: OurConditionGroup) =>
                      v?.conditions?.length ? Promise.resolve() : Promise.reject(new Error('Add at least one condition')),
                  },
                ]}
              >
                {/** Do not emit empty onChange — it would overwrite Form.Item so conditions are not saved */}
                <ConditionBuilder />
              </Form.Item>

              <Divider titlePlacement="start">Actions</Divider>
              <Form.Item
                validateTrigger="onSubmit"
                name="actions"
                rules={[
                  {
                    validator: (_, v: AutomationActions) =>
                      hasAtLeastOneAction(v) ? Promise.resolve() : Promise.reject(new Error('Select at least one action')),
                  },
                ]}
              >
                <ActionBuilder />
              </Form.Item>

              <div className="settings-form__footer">
                <Button onClick={() => router.push(LIST_HREF)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  {isEdit ? 'Save rule' : 'Create rule'}
                </Button>
              </div>
            </Form>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
