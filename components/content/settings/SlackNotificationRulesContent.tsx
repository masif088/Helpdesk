'use client'

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

type RuleRow = {
  id: string
  name: string
  webhook_url_masked: string
  is_enabled: boolean
  filter: Record<string, unknown>
  sort_order: number
  created_at: string
  updated_at: string
}

interface SlackNotificationRulesContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

type Option = { label: string; value: string | number }

function filterFromApi(f: Record<string, unknown> | undefined) {
  const raw = f && typeof f === 'object' ? f : {}
  const toSlugs = Array.isArray(raw.to_status_slugs)
    ? (raw.to_status_slugs as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0)
    : []
  const slackNote = typeof raw.slack_note === 'string' ? raw.slack_note : ''
  const tagIds = Array.isArray(raw.tag_ids)
    ? (raw.tag_ids as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  return {
    on_ticket_created: raw.on_ticket_created !== false,
    on_status_changed: raw.on_status_changed === true,
    on_client_reply: raw.on_client_reply === true,
    on_tag_added: raw.on_tag_added === true,
    team_ids: Array.isArray(raw.team_ids) ? (raw.team_ids as string[]) : [],
    company_ids: Array.isArray(raw.company_ids) ? (raw.company_ids as string[]) : [],
    type_ids: Array.isArray(raw.type_ids) ? (raw.type_ids as number[]) : [],
    to_status_slugs: toSlugs,
    tag_ids: tagIds,
    account_manager_ids: Array.isArray(raw.account_manager_ids)
      ? (raw.account_manager_ids as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [],
    slack_note: slackNote,
  }
}

export default function SlackNotificationRulesContent({ user }: SlackNotificationRulesContentProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<RuleRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RuleRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const [teamOpts, setTeamOpts] = useState<Option[]>([])
  const [companyOpts, setCompanyOpts] = useState<Option[]>([])
  const [typeOpts, setTypeOpts] = useState<Option[]>([])
  const [statusOpts, setStatusOpts] = useState<Option[]>([])
  const [tagOpts, setTagOpts] = useState<Option[]>([])
  const [managerOpts, setManagerOpts] = useState<Option[]>([])

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/slack-notification-rules', { credentials: 'include' })
      const raw = await res.text()
      let data: unknown = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = null
      }
      if (!res.ok) {
        const errMsg =
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Failed to load rules (HTTP ${res.status})`
        throw new Error(errMsg)
      }
      setRules(Array.isArray(data) ? data : [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSelectData = useCallback(async () => {
    try {
      const [teamsRes, compRes, typRes, statusRes, tagsRes, usersRes] = await Promise.all([
        fetch('/api/teams', { credentials: 'include' }),
        fetch('/api/companies', { credentials: 'include' }),
        fetch('/api/ticket-types', { credentials: 'include' }),
        fetch('/api/ticket-statuses', { credentials: 'include' }),
        fetch('/api/tags', { credentials: 'include' }),
        fetch('/api/users', { credentials: 'include' }),
      ])
      const teamsJson = teamsRes.ok ? await teamsRes.json() : []
      const compWrap = compRes.ok ? await compRes.json() : {}
      const typJson = typRes.ok ? await typRes.json() : []
      const statusJson = statusRes.ok ? await statusRes.json() : []
      const tagsJson = tagsRes.ok ? await tagsRes.json() : []
      const usersJson = usersRes.ok ? await usersRes.json() : []
      const compList = Array.isArray(compWrap.data) ? compWrap.data : []
      const usersList = Array.isArray(usersJson) ? usersJson : []

      setTeamOpts(
        (Array.isArray(teamsJson) ? teamsJson : []).map((t: { id: string; name: string }) => ({
          label: t.name,
          value: t.id,
        }))
      )
      setCompanyOpts(
        compList.map((c: { id: string; name: string }) => ({
          label: c.name,
          value: c.id,
        }))
      )
      setTypeOpts(
        (Array.isArray(typJson) ? typJson : []).map((t: { id: number; title: string }) => ({
          label: t.title,
          value: t.id,
        }))
      )
      setStatusOpts(
        (Array.isArray(statusJson) ? statusJson : [])
          .filter((s: { is_active?: boolean }) => s.is_active !== false)
          .map((s: { slug: string; title: string }) => ({
            label: s.title,
            value: s.slug,
          }))
      )
      setTagOpts(
        (Array.isArray(tagsJson) ? tagsJson : []).map((t: { id: string; name: string }) => ({
          label: t.name,
          value: t.id,
        }))
      )
      setManagerOpts(
        usersList
          .filter((u: { role?: string }) => !['customer'].includes((u.role ?? '').toLowerCase()))
          .map((u: { id: string; full_name?: string; email?: string }) => ({
            label: u.full_name?.trim() || u.email || u.id,
            value: u.id,
          }))
      )
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    loadRules()
    loadSelectData()
  }, [loadRules, loadSelectData])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      name: '',
      webhook_url: '',
      is_enabled: true,
      sort_order: 0,
      on_ticket_created: true,
      on_status_changed: false,
      on_client_reply: false,
      on_tag_added: false,
      team_ids: [],
      company_ids: [],
      type_ids: [],
      to_status_slugs: [],
      tag_ids: [],
      account_manager_ids: [],
      slack_note: '',
    })
    setModalOpen(true)
  }

  const openEdit = (row: RuleRow) => {
    setEditing(row)
    const f = filterFromApi(row.filter)
    form.setFieldsValue({
      name: row.name,
      webhook_url: '',
      is_enabled: row.is_enabled,
      sort_order: row.sort_order,
      on_ticket_created: f.on_ticket_created,
      on_status_changed: f.on_status_changed,
      on_client_reply: f.on_client_reply,
      on_tag_added: f.on_tag_added,
      team_ids: f.team_ids,
      company_ids: f.company_ids,
      type_ids: f.type_ids,
      to_status_slugs: f.to_status_slugs,
      tag_ids: f.tag_ids,
      account_manager_ids: f.account_manager_ids,
      slack_note: f.slack_note,
    })
    setModalOpen(true)
  }

  const submit = async () => {
    const v = await form.validateFields().catch(() => null)
    if (!v) return
    const sortOrder =
      typeof v.sort_order === 'number' && !Number.isNaN(v.sort_order)
        ? v.sort_order
        : Number.parseInt(String(v.sort_order ?? '0'), 10) || 0
    const filter = {
      on_ticket_created: v.on_ticket_created !== false,
      on_status_changed: v.on_status_changed === true,
      on_client_reply: v.on_client_reply === true,
      on_tag_added: v.on_tag_added === true,
      team_ids: v.team_ids?.length ? v.team_ids : [],
      company_ids: v.company_ids?.length ? v.company_ids : [],
      type_ids: v.type_ids?.length ? v.type_ids : [],
      to_status_slugs: v.to_status_slugs?.length ? v.to_status_slugs : [],
      tag_ids: v.tag_ids?.length ? v.tag_ids : [],
      account_manager_ids: v.account_manager_ids?.length ? v.account_manager_ids : [],
      slack_note: typeof v.slack_note === 'string' ? v.slack_note.trim().slice(0, 1000) : '',
    }
    setSaving(true)
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: v.name?.trim() || '',
          is_enabled: v.is_enabled !== false,
          sort_order: sortOrder,
          filter,
        }
        const w = typeof v.webhook_url === 'string' ? v.webhook_url.trim() : ''
        if (w.length > 0) body.webhook_url = w
        const res = await fetch(`/api/slack-notification-rules/${editing.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Save failed')
        message.success('Rule updated')
      } else {
        const res = await fetch('/api/slack-notification-rules', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: v.name?.trim() || '',
            webhook_url: v.webhook_url?.trim(),
            is_enabled: v.is_enabled !== false,
            sort_order: sortOrder,
            filter,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Create failed')
        message.success('Rule created')
      }
      setModalOpen(false)
      loadRules()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/slack-notification-rules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      message.success('Rule removed')
      loadRules()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const columns: ColumnsType<RuleRow> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (n: string) => n || <Text type="secondary">—</Text>,
    },
    {
      title: 'Webhook',
      dataIndex: 'webhook_url_masked',
      key: 'webhook_url_masked',
      render: (m: string) => <Text code>{m}</Text>,
    },
    {
      title: 'Events',
      key: 'events',
      render: (_, row) => {
        const f = filterFromApi(row.filter)
        return (
          <Space size={4} wrap>
            {f.on_ticket_created ? <Tag color="blue">Created</Tag> : null}
            {f.on_status_changed ? <Tag color="purple">Status</Tag> : null}
            {f.on_client_reply ? <Tag color="orange">Client reply</Tag> : null}
            {f.on_tag_added ? <Tag color="cyan">Tag added</Tag> : null}
            {f.slack_note?.trim() ? <Tag>Note</Tag> : null}
            {!f.on_ticket_created && !f.on_status_changed && !f.on_client_reply && !f.on_tag_added && !f.slack_note?.trim() ? (
              <Text type="secondary">—</Text>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: 'Filters',
      key: 'filters',
      render: (_, row) => {
        const f = filterFromApi(row.filter)
        const parts: string[] = []
        if (f.team_ids.length) parts.push(`${f.team_ids.length} team(s)`)
        if (f.company_ids.length) parts.push(`${f.company_ids.length} company`)
        if (f.type_ids.length) parts.push(`${f.type_ids.length} type`)
        if (f.to_status_slugs.length) parts.push(`${f.to_status_slugs.length} new status`)
        if (f.account_manager_ids.length) parts.push(`${f.account_manager_ids.length} manager(s)`)
        return parts.length > 0 ? (
          <Text type="secondary">{parts.join(' · ')}</Text>
        ) : (
          <Text type="secondary">All tickets</Text>
        )
      },
    },
    {
      title: 'On',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      width: 72,
      render: (on: boolean) => (on ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Popconfirm title="Delete this rule?" onConfirm={() => remove(row.id)}>
            <Button type="primary" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={{ id: user.id, role: user.role ?? undefined }}>
        <Content style={{ padding: 24 }}>
          <SettingsBackLink />
          <div style={{ marginBottom: 24 }}>
            <Title level={2} style={{ margin: 0 }}>
              Slack notifications
            </Title>
            <Text type="secondary">
              Post to a Slack channel (Incoming Webhook) when a ticket matches your filters and events.
            </Text>
          </div>

            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              In Slack: <Text strong>App</Text> → choose your workspace → <Text strong>Incoming Webhooks</Text> → add to a
              channel → copy the URL that starts with <Text code>https://hooks.slack.com/services/</Text>. One URL = one
              channel. Leave all team / company / type / tag / new-status filters empty so every ticket that
              matches the selected events is included. When you use more than one of those filters, they combine with{' '}
              <Text strong>AND</Text> (ticket must match all of them); inside one field, multiple values are{' '}
              <Text strong>OR</Text> (e.g. any of the selected companies).
            </Paragraph>
            <div style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add rule
              </Button>
            </div>
            <Table<RuleRow>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rules}
              pagination={false}
            />
        </Content>
      </AdminMainColumn>

      <Modal
        title={editing ? 'Edit rule' : 'New rule'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        confirmLoading={saving}
        width={800}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Label (optional)">
            <Input placeholder="e.g. Urgent → #alerts" maxLength={255} />
          </Form.Item>
          <Flex gap={16}>
          <Form.Item
            name="webhook_url"
            label={editing ? 'New webhook URL (optional)' : 'Incoming Webhook URL'}
            rules={
              editing
                ? []
                : [
                    { required: true, message: 'Webhook URL required' },
                    {
                      pattern: /^https:\/\/hooks\.slack\.com\/services\/.+/,
                      message: 'Must start with https://hooks.slack.com/services/',
                    },
                  ]
            }
            extra={
              editing ? (
                <Text type="secondary">
                  Leave blank to keep the saved URL ({editing.webhook_url_masked}).
                </Text>
              ) : null
            }
          >
            <Input.Password placeholder="https://hooks.slack.com/services/..." autoComplete="off" />
          </Form.Item>
          <Form.Item name="is_enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          </Flex>

        
          <Form.Item
            name="slack_note"
            label="Additional note for Slack (optional)"
            extra={
              <Text type="secondary">
                Plain text; displayed above the ticket line in Slack (italic format). Suitable for context, @channel, or
                link runbook.
              </Text>
            }
          >
            <TextArea rows={3} placeholder="e.g. P1 — please confirm in the thread" maxLength={1000} showCount />
          </Form.Item>
          <Title level={5}>When to notify</Title>
          <Flex gap={16}>
          <Form.Item name="on_ticket_created" valuePropName="checked" initialValue>
            <Checkbox>Ticket created</Checkbox>
          </Form.Item>
          <Form.Item name="on_status_changed" valuePropName="checked">
            <Checkbox>Status changed</Checkbox>
          </Form.Item>
          <Form.Item name="on_client_reply" valuePropName="checked">
            <Checkbox>Client / portal reply (comment)</Checkbox>
          </Form.Item>
          <Form.Item name="on_tag_added" valuePropName="checked">
            <Checkbox>Tag added to ticket</Checkbox>
          </Form.Item>
          </Flex>
        
          <Title level={5}>Only if ticket matches (optional)</Title>
          <Paragraph type="secondary" style={{ marginTop: -8, marginBottom: 12 }}>
            Across Team, Company, Type, Tags, etc., each filled section must pass — that is <Text strong>AND</Text>.
            Inside one multi-select, any selected value can match — that is <Text strong>OR</Text> (e.g. Company A or
            Company B).
          </Paragraph>
          <Flex gap={16}>
          <Form.Item name="team_ids" label="Teams" style={{ width: '50%' }}>
            <Select mode="multiple" allowClear placeholder="Any team" options={teamOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="company_ids" label="Companies" style={{ width: '50%' }}>
            <Select mode="multiple" allowClear placeholder="Any company" options={companyOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="type_ids" label="Ticket types" style={{ width: '50%' }}>
            <Select mode="multiple" allowClear placeholder="Any type" options={typeOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="account_manager_ids" label="Account Manager" style={{ width: '50%' }}>
            <Select mode="multiple" allowClear placeholder="Any manager" options={managerOpts} optionFilterProp="label" />
          </Form.Item>
          </Flex>
          <Form.Item
            name="tag_ids"
            label="Tags"
            extra={
              <Text type="secondary">
                If you pick one or more tags, only tickets that have <Text strong>at least one</Text> of those tags are
                included. Leave empty for any tags.
              </Text>
            }
          >
            <Select mode="multiple" allowClear placeholder="Any tags" options={tagOpts} optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            name="to_status_slugs"
            label="New status (after change)"
            extra={
              <Text type="secondary">
                Only applies when <Text strong>Status changed</Text> is enabled. Leave empty for any new status; otherwise
                notify only if the ticket moves into one of the selected statuses.
              </Text>
            }
          >
            <Select mode="multiple" allowClear placeholder="Any new status" options={statusOpts} optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
