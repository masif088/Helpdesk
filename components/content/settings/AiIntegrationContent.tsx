'use client'

import {
  ApiOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  PoweroffOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Badge,
  Button,
  Card,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import type { AiChatPublicConfig } from '@/lib/ai-chat-config'

const { Content } = Layout
const { Title, Text } = Typography

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

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: AiSettingRow) => (
        <Space>
          <Text strong>{name}</Text>
          {row.isActive && <Badge status="success" text={<Text type="success" style={{ fontSize: 12 }}>Active</Text>} />}
        </Space>
      ),
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      render: (p: string) => (
        <Tag color={p === 'codex' ? 'purple' : 'blue'} icon={<RobotOutlined />}>
          {p === 'codex' ? 'Codex' : 'OpenAI'}
        </Tag>
      ),
    },
    {
      title: 'Model',
      key: 'model',
      render: (_: unknown, row: AiSettingRow) => {
        const model = row.provider === 'codex' ? row.codexModel : row.openaiModel
        return <Text code>{model || <Text type="secondary">default</Text>}</Text>
      },
    },
    {
      title: 'API Key',
      key: 'apiKey',
      render: (_: unknown, row: AiSettingRow) => {
        const key = row.provider === 'codex' ? row.codexApiKey : row.openaiApiKey
        return key ? <Tag color="success" icon={<CheckCircleOutlined />}>Configured</Tag> : <Tag color="default">Not set</Tag>
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, row: AiSettingRow) => (
        <Space>
          {!row.isActive && (
            <Tooltip title="Activate this configuration">
              <Button
                size="small"
                type="primary"
                icon={<PoweroffOutlined />}
                loading={activating === row.id}
                onClick={() => handleActivate(row.id)}
              >
                Activate
              </Button>
            </Tooltip>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this configuration?"
            description={row.isActive ? 'Cannot delete active configuration.' : 'This action cannot be undone.'}
            disabled={row.isActive}
            onConfirm={() => handleDelete(row.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleting === row.id}
              disabled={row.isActive}
            />
          </Popconfirm>
        </Space>
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
          <SettingsBackLink />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <Title level={3} className="settings-section-heading" style={{ margin: '0 0 2px' }}>
                AI Settings
              </Title>
              <Text type="secondary">
                Save multiple configurations and activate whichever one you need — no restart required.
              </Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add configuration
            </Button>
          </div>

          {rows.length === 0 && !loading && (
            <Alert
              type="info"
              showIcon
              message="No saved configurations"
              description="AI is currently using environment variables. Add a configuration above to switch to DB-managed settings."
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            dataSource={rows}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={false}
            rowClassName={(row) => row.isActive ? 'ant-table-row-selected' : ''}
            style={{ marginBottom: 16 }}
          />

          {/* Active config summary */}
          <Card size="small" title={<><ApiOutlined /> Active configuration</>}>
            {activeRow ? (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div><Text type="secondary">Name: </Text><Text strong>{activeRow.name}</Text></div>
                <div><Text type="secondary">Provider: </Text><Tag color={activeRow.provider === 'codex' ? 'purple' : 'blue'} icon={<RobotOutlined />}>{activeRow.provider}</Tag></div>
                <div><Text type="secondary">Model: </Text><Text code>{(activeRow.provider === 'codex' ? activeRow.codexModel : activeRow.openaiModel) || 'default'}</Text></div>
                <div><Text type="secondary">Source: </Text><Tag icon={<DatabaseOutlined />}>Database</Tag></div>
              </Space>
            ) : (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div><Text type="secondary">Provider: </Text><Tag color={activeConfig.provider === 'codex' ? 'purple' : 'blue'} icon={<RobotOutlined />}>{activeConfig.provider}</Tag></div>
                <div><Text type="secondary">Model: </Text><Text code>{activeConfig.model}</Text></div>
                <div><Text type="secondary">API Key: </Text>{activeConfig.apiKeyConfigured ? <Tag color="success">Configured</Tag> : <Tag color="error">Not set</Tag>}</div>
                <div><Text type="secondary">Source: </Text><Tag>📄 .env file</Tag></div>
              </Space>
            )}
          </Card>
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
