'use client'

import { KeyOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

const { Text } = Typography

type Member = {
  id: string
  email: string
  full_name: string | null
  status: string
  company_role: string
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText || 'Request failed')
  }
  return data as T
}

export default function CustomerPortalTeamSection({
  companyId,
  canManagePortal = false,
  currentUserId,
}: {
  companyId: string
  /** Add users / reset passwords — server also enforces on POST/PATCH. */
  canManagePortal?: boolean
  /** Used to hide self-service status / password actions on own row. */
  currentUserId?: string
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [canManageFromApi, setCanManageFromApi] = useState<boolean | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [statusActionId, setStatusActionId] = useState<string | null>(null)
  const [form] = Form.useForm<{ email: string; password: string; full_name?: string }>()
  const [resetForm] = Form.useForm<{ password: string; confirm: string }>()

  const load = useCallback(async () => {
    if (!companyId?.trim()) {
      setMembers([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await apiJson<{ members: Member[]; currentUserIsCompanyAdmin?: boolean }>(
        `/api/companies/${encodeURIComponent(companyId)}/portal-members`,
      )
      setMembers(data.members || [])
      if (typeof data.currentUserIsCompanyAdmin === 'boolean') {
        setCanManageFromApi(data.currentUserIsCompanyAdmin)
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to load team')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const openReset = useCallback((userId: string) => {
    setResetUserId(userId)
    resetForm.resetFields()
  }, [resetForm])

  const setMemberStatus = useCallback(
    async (userId: string, status: 'active' | 'inactive') => {
      setStatusActionId(userId)
      try {
        await apiJson(`/api/companies/${encodeURIComponent(companyId)}/portal-members/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        message.success(status === 'inactive' ? 'Member deactivated' : 'Member reactivated')
        await load()
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : 'Failed to update status')
      } finally {
        setStatusActionId(null)
      }
    },
    [companyId, load],
  )

  const canManage = canManageFromApi ?? canManagePortal

  const columns = useMemo(() => {
    const base = [
      {
        title: 'Name',
        key: 'name',
        render: (_: unknown, row: Member) => row.full_name || '—',
      },
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
      },
      {
        title: 'Status',
        key: 'status',
        width: 100,
        render: (_: unknown, row: Member) => {
          const active = (row.status || 'active').toLowerCase() === 'active'
          return active ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>
        },
      },
      {
        title: 'Role',
        key: 'role',
        width: 120,
        render: (_: unknown, row: Member) =>
          row.company_role === 'company_admin' ? <Tag color="blue">Portal admin</Tag> : <Tag>Member</Tag>,
      },
    ]
    if (!canManage) return base
    return [
      ...base,
      {
        title: 'Actions',
        key: 'actions',
        width: 280,
        render: (_: unknown, row: Member) => {
          const isSelf = currentUserId != null && row.id === currentUserId
          const isPortalAdminRow = row.company_role === 'company_admin'
          const active = (row.status || 'active').toLowerCase() === 'active'
          const canToggleStatus = !isSelf && !isPortalAdminRow
          return (
            <Space wrap size="small">
              <Button size="small" icon={<KeyOutlined />} onClick={() => openReset(row.id)}>
                Reset password
              </Button>
              {canToggleStatus ? (
                active ? (
                  <Popconfirm
                    title="Deactivate this member?"
                    description="They will not be able to sign in until reactivated."
                    okText="Deactivate"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void setMemberStatus(row.id, 'inactive')}
                  >
                    <Button size="small" danger loading={statusActionId === row.id}>
                      Deactivate
                    </Button>
                  </Popconfirm>
                ) : (
                  <Popconfirm
                    title="Reactivate this member?"
                    description="They will be able to sign in again."
                    okText="Reactivate"
                    cancelText="Cancel"
                    onConfirm={() => void setMemberStatus(row.id, 'active')}
                  >
                    <Button size="small" loading={statusActionId === row.id}>
                      Activate
                    </Button>
                  </Popconfirm>
                )
              ) : null}
            </Space>
          )
        },
      },
    ]
  }, [canManage, currentUserId, openReset, setMemberStatus, statusActionId])

  return (
    <>
      <section className="ticket-surface billing-section">
        <header className="billing-section__head">
          <span>
            <TeamOutlined /> Portal accounts
          </span>
          {canManage ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Add account
            </Button>
          ) : null}
        </header>
        <Text type="secondary" style={{ display: 'block', padding: '0 16px 12px', fontSize: 13 }}>
          {canManage
            ? 'Create logins, reset passwords, and deactivate or reactivate members (except other portal admins and yourself).'
            : 'Everyone in your company can see who has portal access. Only a portal admin can add accounts or change them.'}
        </Text>
        <Table<Member>
          className="ticket-table"
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={members}
          pagination={false}
        />
      </section>

      <Modal
        title="Add portal user"
        open={addOpen}
        onCancel={() => {
          setAddOpen(false)
          form.resetFields()
        }}
        okText="Create"
        confirmLoading={addLoading}
        onOk={async () => {
          try {
            const values = await form.validateFields()
            setAddLoading(true)
            await apiJson(`/api/companies/${encodeURIComponent(companyId)}/portal-members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: values.email,
                password: values.password,
                full_name: values.full_name || '',
              }),
            })
            message.success('User created')
            setAddOpen(false)
            form.resetFields()
            load()
          } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return
            message.error(e instanceof Error ? e.message : 'Failed to create user')
          } finally {
            setAddLoading(false)
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Required' },
              { type: 'email', message: 'Invalid email' },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="full_name" label="Full name">
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="Initial password"
            rules={[{ required: true, message: 'Required' }, { min: 6, message: 'At least 6 characters' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Reset password"
        open={!!resetUserId}
        onCancel={() => {
          setResetUserId(null)
          resetForm.resetFields()
        }}
        okText="Save"
        confirmLoading={resetLoading}
        onOk={async () => {
          if (!resetUserId) return
          try {
            const v = await resetForm.validateFields()
            if (v.password !== v.confirm) {
              message.error('Passwords do not match')
              return
            }
            setResetLoading(true)
            await apiJson(`/api/companies/${encodeURIComponent(companyId)}/portal-members/${encodeURIComponent(resetUserId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: v.password }),
            })
            message.success('Password updated')
            setResetUserId(null)
            resetForm.resetFields()
          } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return
            message.error(e instanceof Error ? e.message : 'Failed to reset password')
          } finally {
            setResetLoading(false)
          }
        }}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="password"
            label="New password"
            rules={[{ required: true, message: 'Required' }, { min: 6, message: 'At least 6 characters' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm password"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
