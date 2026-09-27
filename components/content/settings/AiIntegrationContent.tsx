'use client'

import { ApiOutlined, PlusOutlined, PoweroffOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Layout, message, Modal, Select, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import RowActions from '@/components/settings/RowActions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { Chip, StatusPill } from '@/components/ticket/list/TicketChips'
import type { AiChatPublicConfig } from '@/lib/ai-chat-config'

const { Content } = Layout

interface AiSettingRow {
  id: string
  name: string
  isActive: boolean
  provider: string
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  codexApiKey: string
  codexBaseUrl: string
  codexModel: string
  createdAt: string
  updatedAt: string
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  config: AiChatPublicConfig
  availableModels: string[]
}

export default function AiIntegrationContent({ user: currentUser, config }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<AiSettingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<AiSettingRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [activeConfig, setActiveConfig] = useState(config)
  const [form] = Form.useForm()
  const [messageApi, ctx] = message.useMessage()
  const provider = Form.useWatch('provider', form)

  const fetchRows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai-settings')
      const data = await res.json()
      setRows(data.data ?? [])
      const active = (data.data ?? []).find((r: AiSettingRow) => r.isActive)
      if (active) setActiveConfig((prev) => ({ ...prev, source: 'database', provider: active.provider as 'openai' | 'codex' }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [])

  const openCreate = () => {
    setEditingRow(null)
    form.resetFields()
    form.setFieldsValue({ provider: 'openai' })
    setModalOpen(true)
  }

  const openEdit = (row: AiSettingRow) => {
    setEditingRow(row)
    form.setFieldsValue({
      name: row.name,
      provider: row.provider,
      openaiApiKey: row.openaiApiKey,
      openaiBaseUrl: row.openaiBaseUrl,
      openaiModel: row.openaiModel,
      codexApiKey: row.codexApiKey,
      codexBaseUrl: row.codexBaseUrl,
      codexModel: row.codexModel,
    })
    setModalOpen(true)
  }

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true)
    try {
      const url = editingRow ? `/api/ai-settings/${editingRow.id}` : '/api/ai-settings'
      const method = editingRow ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      messageApi.success(editingRow ? 'Configuration updated' : 'Configuration created')
      setModalOpen(false)
      await fetchRows()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (id: string) => {
    setActivating(id)
    try {
      const res = await fetch(`/api/ai-settings/${id}/activate`, { method: 'POST' })
      if (!res.ok) throw new Error()
      messageApi.success('Configuration activated — takes effect immediately')
      await fetchRows()
    } catch {
      messageApi.error('Failed to activate')
    } finally {
      setActivating(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/ai-settings/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      messageApi.success('Configuration deleted')
      await fetchRows()
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const [testing, setTesting] = useState(false)
  const testConnection = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/ai-settings/test', { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Connection failed')
      const note = data.modelAvailable === false ? ` — model "${data.model}" was not in the provider's model list` : ''
      messageApi[data.modelAvailable === false ? 'warning' : 'success'](`Connected to ${data.provider} in ${data.latencyMs} ms${note}`)
    } catch (e) {
      messageApi.error((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const columns: ColumnsType<AiSettingRow> = [
    {
      title: 'Configuration',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: AiSettingRow) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="cell-strong">{name}</span>
          {row.isActive ? <StatusPill color="#16A34A" title="Active" /> : null}
        </span>
      ),
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 140,
      render: (p: string) => <Chip color={p === 'codex' ? '#8B5CF6' : '#0F9D8A'}>{p === 'codex' ? 'Codex' : 'OpenAI'}</Chip>,
    },
    {
      title: 'Model',
      key: 'model',
      width: 180,
      render: (_: unknown, row: AiSettingRow) => {
        const model = row.provider === 'codex' ? row.codexModel : row.openaiModel
        return <span className={model ? 'cell-strong' : 'cell-muted'}>{model || 'default'}</span>
      },
    },
    {
      title: 'API key',
      key: 'apiKey',
      width: 130,
      render: (_: unknown, row: AiSettingRow) => {
        const key = row.provider === 'codex' ? row.codexApiKey : row.openaiApiKey
        return key ? <StatusPill color="#16A34A" title="Set" /> : <StatusPill color="#94A3B8" title="Not set" />
      },
    },
    {
      title: '',
      key: 'actions',
      width: 170,
      align: 'right',
      render: (_: unknown, row: AiSettingRow) => (
        <RowActions
          extra={
            !row.isActive ? (
              <Button size="small" icon={<PoweroffOutlined />} loading={activating === row.id} onClick={() => handleActivate(row.id)}>
                Activate
              </Button>
            ) : null
          }
          onEdit={() => openEdit(row)}
          onDelete={() => handleDelete(row.id)}
          deleteTitle="Delete this configuration?"
          deleteDisabledReason={row.isActive ? 'Activate another configuration before deleting this one' : undefined}
        />
      ),
    },
  ]

  const activeRow = rows.find((r) => r.isActive)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {ctx}
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="AI"
            description="Provider and model for ticket summaries and reply drafts. Save several configurations and switch between them without a restart."
            actions={
              <>
                <Button icon={<ThunderboltOutlined />} loading={testing} onClick={() => void testConnection()}>
                  Test connection
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  Add configuration
                </Button>
              </>
            }
          />

          <div className="email-layout">
            <section className="ticket-surface billing-section">
              <header className="billing-section__head">
                <span>
                  <ApiOutlined /> In use now
                </span>
                {activeRow ? <StatusPill color="#0F9D8A" title="Saved configuration" /> : <StatusPill color="#64748B" title="Server env" />}
              </header>
              <div className="info-grid">
                <div className="info-field">
                  <div className="info-field__label">Provider</div>
                  <div className="info-field__value">{(activeRow?.provider ?? activeConfig.provider) === 'codex' ? 'Codex (OpenAI-compatible)' : 'OpenAI'}</div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Model</div>
                  <div className="info-field__value">
                    {(activeRow ? (activeRow.provider === 'codex' ? activeRow.codexModel : activeRow.openaiModel) : activeConfig.model) || 'default'}
                  </div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">API key</div>
                  <div className="info-field__value">
                    {(activeRow ? !!(activeRow.provider === 'codex' ? activeRow.codexApiKey : activeRow.openaiApiKey) : activeConfig.apiKeyConfigured) ? (
                      <StatusPill color="#16A34A" title="Set" />
                    ) : (
                      <StatusPill color="#DC2626" title="Not set — AI features are off" />
                    )}
                  </div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Source</div>
                  <div className="info-field__value cell-muted">
                    {activeRow ? `Configuration "${activeRow.name}"` : 'Server environment variables (OPENAI_API_KEY, …) — add a configuration to manage it here'}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="ticket-surface ticket-table">
            <Table<AiSettingRow>
              dataSource={rows}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={false}
              locale={{ emptyText: 'No saved configurations — the server environment is used' }}
            />
          </div>
        </Content>
      </AdminMainColumn>

      {/* Create / Edit modal */}
      <Modal
        title={editingRow ? `Edit: ${editingRow.name}` : 'Add AI configuration'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editingRow ? 'Save changes' : 'Create'}
        confirmLoading={saving}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. OpenAI Production, Codex Dev" />
          </Form.Item>

          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="openai">
                <Tag color="blue">OpenAI</Tag> OpenAI Platform (api.openai.com)
              </Select.Option>
              <Select.Option value="codex">
                <Tag color="purple">Codex</Tag> Codex / Custom OpenAI-compatible proxy
              </Select.Option>
            </Select>
          </Form.Item>

          {(provider === 'openai' || !provider) && (
            <Card size="small" type="inner" title={<><Tag color="blue">OpenAI</Tag> Configuration</>} style={{ marginBottom: 12 }}>
              <Form.Item name="openaiApiKey" label="API Key" style={{ marginBottom: 8 }}>
                <Input.Password placeholder="sk-proj-... (leave blank to keep existing)" />
              </Form.Item>
              <Form.Item name="openaiBaseUrl" label="Base URL" style={{ marginBottom: 8 }}>
                <Input placeholder="https://api.openai.com/v1 (default)" />
              </Form.Item>
              <Form.Item name="openaiModel" label="Model" style={{ marginBottom: 0 }}>
                <Input placeholder="gpt-4o-mini (default)" />
              </Form.Item>
            </Card>
          )}

          {provider === 'codex' && (
            <Card size="small" type="inner" title={<><Tag color="purple">Codex</Tag> Configuration</>} style={{ marginBottom: 12 }}>
              <Form.Item name="codexApiKey" label="API Key" style={{ marginBottom: 8 }}>
                <Input.Password placeholder="Leave blank to keep existing" />
              </Form.Item>
              <Form.Item
                name="codexBaseUrl"
                label="Base URL (required)"
                rules={[{ required: true, message: 'Base URL is required for Codex' }]}
                style={{ marginBottom: 8 }}
              >
                <Input placeholder="https://your-codex-proxy.com" />
              </Form.Item>
              <Form.Item name="codexModel" label="Model" style={{ marginBottom: 0 }}>
                <Input placeholder="gpt-5.4 (default)" />
              </Form.Item>
            </Card>
          )}
        </Form>
      </Modal>
    </Layout>
  )
}
