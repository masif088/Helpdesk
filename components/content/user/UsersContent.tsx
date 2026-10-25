'use client'

import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Alert, Avatar, Button, Col, Form, Input, Layout, message, Modal, Popconfirm, Row, Select, Space, Tag, Tooltip, Typography, Upload } from 'antd'
import { useRouter } from 'next/navigation'
import { type Key,useEffect, useMemo, useState } from 'react'

import { createUser } from '@/app/actions/users'
import AppTable from '@/components/common/AppTable'
import { Chip, StatusPill } from '@/components/ticket/list/TicketChips'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { CONTACT_KIND_LABELS, CONTACT_KINDS } from '@/lib/contact-kind'
import { USER_DEPARTMENTS, USER_POSITIONS } from '@/lib/user-work-dropdowns'
import { uploadAvatar } from '@/utils/storage'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import type { ColumnsType } from 'antd/es/table'

import DateDisplay from '@/components/common/DateDisplay'
import { shouldOpenHrefInNewTab,SpaNavLink } from '@/components/common/SpaNavLink'
import { confirmUserCompanyMove } from '@/components/company/confirm-user-company-move'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

type UserAudienceTab = 'customer' | 'non_customer'

interface UsersContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  /** 'customer' → /contacts (portal contacts); 'staff' → Settings → Users (internal accounts) */
  audience?: 'customer' | 'staff'
}

const STATUS_COLORS: Record<string, string> = {
  active: '#16A34A',
  inactive: '#94A3B8',
  suspended: '#DC2626',
  pending: '#F59E0B',
}
const ROLE_COLORS: Record<string, string> = {
  admin: '#DC2626',
  manager: '#2563EB',
  staff: '#0F9D8A',
  user: '#0F9D8A',
  customer: '#0E7490',
}

interface UserRecord {
  id: string
  email: string
  contact_kind?: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  role: string
  status: string
  company_id: string | null
  company?: { id: string; name: string } | null
  avatar_url: string | null
  created_at: string
  last_login_at: string | null
  last_active_at: string | null
  phone: string | null
  department: string | null
  position: string | null
  skills?: string[]
  bio: string | null
  timezone: string | null
  locale: string | null
  is_email_verified: boolean | null
}

export default function UsersContent({ user: currentUser, audience = 'staff' }: UsersContentProps) {
  const router = useRouter()
  const isCustomer = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'customer'
  const isAdmin = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'admin'
  const [collapsed, setCollapsed] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const audienceTab: UserAudienceTab = audience === 'customer' ? 'customer' : 'non_customer'
  const detailHref = (id: string) => (audience === 'customer' ? `/contacts/${id}` : `/settings/users/${id}`)
  /** Contacts page: role is always customer, no status field, has a contact type */
  const isContactsPage = !isCustomer && audienceTab === 'customer'
  const noun = isContactsPage ? 'Contact' : 'User'
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [filterRole, setFilterRole] = useState<string | undefined>(undefined)
  /** Contacts page: person / automated, and company ('__none__' = no company) */
  const [filterKind, setFilterKind] = useState<string | undefined>(undefined)
  const [filterCompany, setFilterCompany] = useState<string | undefined>(undefined)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [bulkAction, setBulkAction] = useState<'active' | 'inactive' | 'delete' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetEmailUserId, setResetEmailUserId] = useState<string | null>(null)
  const [resetEmailAlert, setResetEmailAlert] = useState<{
    type: 'success' | 'error'
    message: string
    description: string
  } | null>(null)
  const selectedRole = Form.useWatch('role', form)

  const bulkDeletableCount = useMemo(
    () => selectedRowKeys.filter((k) => String(k) !== currentUser.id).length,
    [selectedRowKeys, currentUser.id]
  )

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const matchCompany =
          !isCustomer && audienceTab === 'non_customer' ? false : (u.company?.name || '').toLowerCase().includes(q)
        const matchDepartment =
          !isCustomer && audienceTab === 'customer' ? false : (u.department || '').toLowerCase().includes(q)
        const matchPosition =
          !isCustomer && audienceTab === 'customer' ? false : (u.position || '').toLowerCase().includes(q)
        const matchSkill = !isCustomer && audienceTab === 'customer' ? false : (u.skills ?? []).some((s) => s.toLowerCase().includes(q))
        const matchesSearch =
          (u.first_name || '').toLowerCase().includes(q) ||
          (u.last_name || '').toLowerCase().includes(q) ||
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          matchCompany ||
          matchDepartment ||
          matchPosition ||
          matchSkill
        if (!matchesSearch) return false
      }
      if (!isCustomer) {
        if (audienceTab === 'customer' && u.role !== 'customer') return false
        if (audienceTab === 'non_customer' && u.role === 'customer') return false
      }
      if (filterStatus && u.status !== filterStatus) return false
      if (filterRole && u.role !== filterRole) return false
      if (filterKind && (u.contact_kind || 'person') !== filterKind) return false
      if (filterCompany === '__none__' && u.company_id) return false
      if (filterCompany && filterCompany !== '__none__' && u.company_id !== filterCompany) return false
      return true
    })
  }, [users, searchText, audienceTab, filterStatus, filterRole, filterKind, filterCompany, isCustomer])


  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<any[]>('/api/users')
      setUsers(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const data = await apiFetch<{ companies: { id: string; name: string }[] }>('/api/tickets/lookup')
      setCompanies(data?.companies || [])
    } catch {
      setCompanies([])
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchCompanies()
  }, [])

  const handleCreate = () => {
    setEditingUser(null)
    setAvatarUrl(null)
    form.resetFields()
    form.setFieldsValue({
      role: audienceTab === 'customer' ? 'customer' : 'staff',
      status: 'active',
      contact_kind: 'person',
      timezone: 'UTC',
      locale: 'en',
      is_email_verified: false,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: UserRecord) => {
    setEditingUser(record)
    setAvatarUrl(record.avatar_url)
    form.setFieldsValue({
      email: record.email,
      first_name: record.first_name || '',
      last_name: record.last_name || '',
      full_name: record.full_name || '',
      role: record.role,
      status: record.status,
      contact_kind: record.contact_kind || 'person',
      company_id: record.company_id || undefined,
      phone: record.phone || '',
      department: record.department || '',
      position: record.position || '',
      bio: record.bio || '',
      timezone: record.timezone || 'UTC',
      locale: record.locale || 'en',
      is_email_verified: record.is_email_verified || false,
    })
    setModalVisible(true)
  }

  const handleAvatarUpload = async (file: File) => {
    if (!editingUser) {
      message.warning('Please create the user first, then you can upload avatar')
      return
    }

    setUploading(true)
    try {
      const result = await uploadAvatar(file, editingUser.id)

      if (result.error || !result.url) {
        message.error(result.error || 'Failed to upload avatar. Please check storage bucket permissions.')
        console.error('Upload error details:', result.error)
        return
      }

      setAvatarUrl(result.url)
      message.success('Avatar uploaded successfully!')
    } catch (error: any) {
      message.error(error.message || 'Failed to upload avatar')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (userId: string) => {
    try {
      await apiFetch(`/api/users/${userId}`, { method: 'DELETE' })
      message.success('User deactivated')
      setSelectedRowKeys((keys) => keys.filter((k) => String(k) !== userId))
      fetchUsers()
    } catch (error: any) {
      message.error(error.message || 'Failed to deactivate user')
    }
  }

  const sendResetCustomerPasswordEmail = async (record: UserRecord) => {
    if (record.role !== 'customer') {
      message.warning('Reset password from this action is only for customer users')
      return
    }
    setResetEmailUserId(record.id)
    try {
      await apiFetch(`/api/users/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_reset_email: true }),
      })
      message.success(`Reset password email sent to ${record.email}`)
      setResetEmailAlert({
        type: 'success',
        message: 'Reset password email sent',
        description: `Customer ${record.full_name || record.email} has received a reset password email at ${record.email}.`,
      })
    } catch (error: any) {
      message.error(error.message || 'Failed to send reset email')
      setResetEmailAlert({
        type: 'error',
        message: 'Failed to send reset email',
        description:
          error?.message ||
          `Failed to send reset password email to ${record.full_name || record.email}. Please check email integration.`,
      })
    } finally {
      setResetEmailUserId(null)
    }
  }

  const confirmSendResetCustomerPasswordEmail = (record: UserRecord) => {
    Modal.confirm({
      title: 'Send reset password email?',
      icon: <ExclamationCircleOutlined />,
      content: `A reset password email will be sent to ${record.email}. The customer will receive a temporary password for login.`,
      okText: 'Send Email',
      cancelText: 'Cancel',
      onOk: () => sendResetCustomerPasswordEmail(record),
    })
  }

  const handleBulkStatus = async (status: 'active' | 'inactive') => {
    const ids = selectedRowKeys.map(String)
    if (ids.length === 0) return
    setBulkAction(status)
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch(`/api/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Updated ${ok} user(s) to ${status}`)
      if (failed > 0) message.error(`${failed} update(s) failed`)
      setSelectedRowKeys([])
      fetchUsers()
    } catch (error: any) {
      message.error(error.message || 'Bulk update failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkDelete = async () => {
    const withoutSelf = selectedRowKeys.map(String).filter((id) => id !== currentUser.id)
    if (withoutSelf.length === 0) {
      message.warning(
        'Select at least one other user to deactivate. You cannot deactivate your own account from this list.'
      )
      return
    }
    setBulkAction('delete')
    try {
      const results = await Promise.allSettled(
        withoutSelf.map((id) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Deactivated ${ok} user(s)`)
      if (failed > 0) message.error(`${failed} deactivate request(s) failed`)
      setSelectedRowKeys([])
      fetchUsers()
    } catch (error: any) {
      message.error(error.message || 'Bulk deactivate failed')
    } finally {
      setBulkAction(null)
    }
  }

  const runUserModalSave = async (
    values: any,
    options?: { sendActivationEmail?: boolean }
  ) => {
    setSubmitting(true)
    try {
      if (editingUser) {
        const patchBody: Record<string, unknown> = {
          first_name: values.first_name || null,
          last_name: values.last_name || null,
          full_name: values.full_name,
          ...(isContactsPage ? { contact_kind: values.contact_kind || 'person' } : { status: values.status }),
          avatar_url: avatarUrl,
          phone: values.phone || null,
          timezone: values.timezone || 'UTC',
          locale: values.locale || 'en',
          is_email_verified: values.is_email_verified || false,
        }
        if (!isCustomer) {
          Object.assign(patchBody, {
            role: isContactsPage ? 'customer' : values.role,
            company_id: values.company_id || null,
            department: values.department || null,
            position: values.position || null,
            bio: values.bio || null,
          })
        }
        if (isAdmin && values.newPassword?.trim()) {
          patchBody.password = values.newPassword
        }
        await apiFetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })

        message.success(`${noun} updated`)
        setModalVisible(false)
        form.resetFields()
        setAvatarUrl(null)
        fetchUsers()
      } else {
        // Create new user using server action
        const result = await createUser({
          email: values.email,
          password: values.password,
          first_name: values.first_name || null,
          last_name: values.last_name || null,
          full_name: values.full_name,
          role: isCustomer ? 'user' : isContactsPage ? 'customer' : values.role,
          status: isContactsPage ? 'active' : values.status,
        })

        if (result.error) {
          message.error(result.error)
        } else if (result.data) {
          // Update additional fields after creation
          const updateData: any = {
            phone: values.phone || null,
            timezone: values.timezone || 'UTC',
            locale: values.locale || 'en',
            is_email_verified: values.is_email_verified || false,
          }
          if (!isCustomer) {
            Object.assign(updateData, {
              department: values.department || null,
              position: values.position || null,
              bio: values.bio || null,
              company_id: values.company_id || null,
              ...(isContactsPage ? { contact_kind: values.contact_kind || 'person' } : {}),
            })
          }
          if (avatarUrl) {
            updateData.avatar_url = avatarUrl
          }

          await apiFetch(`/api/users/${result.data.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          if (options?.sendActivationEmail) {
            try {
              await apiFetch(`/api/users/${result.data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ send_activation_email: true }),
              })
              message.success(`${noun} created and activation email sent to ${values.email}`)
            } catch (mailErr: any) {
              message.warning(
                `${noun} created, but activation email failed: ${mailErr?.message || 'unknown error'}`
              )
            }
          } else {
            message.success(`${noun} created`)
          }

          setModalVisible(false)
          form.resetFields()
          setAvatarUrl(null)
          fetchUsers()
        }
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save user')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmCreateUserWithActivationEmail = (values: any) => {
    Modal.confirm({
      title: 'Send account activation email?',
      icon: <ExclamationCircleOutlined />,
      content: `Create this user and send an activation email to ${values.email}?`,
      okText: 'Create & Send Email',
      cancelText: 'Create Without Email',
      closable: false,
      maskClosable: false,
      keyboard: false,
      onOk: () => runUserModalSave(values, { sendActivationEmail: true }),
      onCancel: () => {
        void runUserModalSave(values, { sendActivationEmail: false })
      },
    })
  }

  const handleSubmit = async (values: any) => {
    if (!editingUser) {
      if (isAdmin) {
        confirmCreateUserWithActivationEmail(values)
        return
      }
      await runUserModalSave(values, { sendActivationEmail: false })
      return
    }
    if (!isCustomer && values.role === 'customer') {
      const newCo = (values.company_id || null) as string | null
      const oldCo = editingUser.company_id || null
      if (newCo && oldCo && newCo !== oldCo) {
        const userLabel = editingUser.full_name || editingUser.email || 'User'
        confirmUserCompanyMove({
          userLabel,
          fromCompanyName: editingUser.company?.name || 'company lain',
          toCompanyName: companies.find((c) => c.id === newCo)?.name || 'company lain',
          onOk: () => runUserModalSave(values),
        })
        return
      }
    }
    await runUserModalSave(values)
  }
  const baseColumns: ColumnsType<UserRecord> = [
    {
      title: 'User',
      key: 'user',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <SpaNavLink href={detailHref(record.id)} className="people-cell">
          <Avatar size={34} src={record.avatar_url} className="people-cell__avatar">
            {(record.full_name || record.email || '?').trim().charAt(0).toUpperCase()}
          </Avatar>
          <span className="people-cell__text">
            <span className="people-cell__name">{record.full_name || 'N/A'}</span>
            <span className="people-cell__sub">{record.email}</span>
          </span>
        </SpaNavLink>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      sorter: (a, b) => a.role.localeCompare(b.role),
      sortDirections: ['ascend', 'descend'],
      render: (role: string) => {
        return <Chip color={ROLE_COLORS[role] ?? null}>{role.charAt(0).toUpperCase() + role.slice(1)}</Chip>
      },
    },
    {
      title: 'Company',
      key: 'company',
      width: 140,
      sorter: (a, b) => (a.company?.name || '').localeCompare(b.company?.name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (_, r) => (r.company?.name ? <Chip>{r.company.name}</Chip> : <span className="people-muted">—</span>),
    },
    {
      title: 'Type',
      key: 'contact_kind',
      width: 120,
      render: (_, r) =>
        r.contact_kind === 'automated' ? <Chip color="#0E7490">Automated</Chip> : <Chip>Person</Chip>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: (a, b) => a.status.localeCompare(b.status),
      sortDirections: ['ascend', 'descend'],
      render: (status: string) => {
        return <StatusPill color={STATUS_COLORS[status] ?? '#94A3B8'} title={status.charAt(0).toUpperCase() + status.slice(1)} />
      },
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string | null) => dept || 'N/A',
    },
    {
      title: 'Position',
      dataIndex: 'position',
      key: 'position',
      render: (pos: string | null) => pos || 'N/A',
    },
    {
      title: 'Skills',
      dataIndex: 'skills',
      key: 'skills',
      width: 220,
      render: (skills: string[] | undefined) =>
        skills?.length ? (
          <Space size={[4, 4]} wrap>
            {skills.map((s) => (
              <Tag key={s} style={{ marginInlineEnd: 0 }}>
                {s}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Last Login',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      sorter: (a, b) => {
        const da = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
        const db2 = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
        return da - db2
      },
      sortDirections: ['ascend', 'descend'],
      render: (date: string | null) => date ? <DateDisplay date={date} /> : 'Never',
    },
    {
      title: 'Last Active',
      dataIndex: 'last_active_at',
      key: 'last_active_at',
      render: (date: string | null) => date ? <DateDisplay date={date} /> : 'N/A',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      sortDirections: ['ascend', 'descend'],
      render: (date: string) => <DateDisplay date={date} format="date-only" />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="default"
              icon={<EyeOutlined />}
              href={detailHref(record.id)}
              aria-label="View user details"
              onClick={(e) => {
                if (shouldOpenHrefInNewTab(e)) return
                if (e.button !== 0) return
                e.preventDefault()
                router.push(detailHref(record.id))
              }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="primary"
              icon={<EditOutlined />}

              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          {isAdmin && record.role === 'customer' && (
            <Tooltip title="Send reset password email">
              <Button
                icon={<LockOutlined />}
                loading={resetEmailUserId === record.id}
                onClick={() => confirmSendResetCustomerPasswordEmail(record)}
              />
            </Tooltip>
          )}
          {isAdmin ? (
            <Popconfirm
              title="Deactivate user"
              description="The account will be disabled and cannot sign in until reactivated (status set back to active)."
              onConfirm={() => handleDelete(record.id)}
              okText="Deactivate"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
            >
              <Tooltip title="Deactivate user">
                <Button type="primary" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ]

  const columns = useMemo(() => {
    if (isCustomer) {
      return baseColumns.filter(
        (c) => !['role', 'company', 'department', 'position', 'skills', 'contact_kind'].includes(String(c.key))
      )
    }
    const hideKeys = new Set<string>()
    if (audienceTab === 'non_customer') {
      hideKeys.add('company')
      hideKeys.add('contact_kind')
    }
    if (audienceTab === 'customer') {
      hideKeys.add('department')
      hideKeys.add('position')
      hideKeys.add('skills')
      hideKeys.add('role')
      hideKeys.add('status')
    }
    if (hideKeys.size === 0) return baseColumns
    return baseColumns.filter((c) => !hideKeys.has(String(c.key)))
  }, [isCustomer, audienceTab])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {audience === 'staff' && !isCustomer ? <SettingsBackLink /> : null}
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                {isContactsPage ? 'Contacts' : 'Users'}
              </Title>
              <Text className="page-head__sub">
                {isCustomer
                  ? 'People who belong to your organization and can sign in to the portal'
                  : isContactsPage
                    ? 'People and automated senders at your client companies'
                    : 'Internal accounts — admins, managers and staff'}
              </Text>
            </div>
            <div className="page-head__actions">
              <span className="page-head__count">{filteredUsers.length} shown</span>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                {isContactsPage ? 'Add contact' : 'Add user'}
              </Button>
            </div>
          </div>

          {isCustomer ?? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Your company"
              description="This list includes anyone linked to your company: users with your company set as their primary company, plus members added under Companies. Customer users only see tickets for that company."
            />
          ) }

            {resetEmailAlert && (
              <Alert
                type={resetEmailAlert.type}
                showIcon
                closable
                style={{ marginBottom: 16 }}
                message={resetEmailAlert.message}
                description={resetEmailAlert.description}
                onClose={() => setResetEmailAlert(null)}
              />
            )}
            <div className="page-toolbar">
              <Space wrap>
                <Input
                  placeholder={
                    !isCustomer && audienceTab === 'non_customer'
                      ? 'Search by name, email, department...'
                      : 'Search by name, email, company...'
                  }
                  prefix={<SearchOutlined />}
                  allowClear
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setPagination((p) => ({ ...p, current: 1 }))
                  }}
                  style={{ width: 260 }}
                />
{!isContactsPage && (
                <Select
                  placeholder="Filter by Status"
                  allowClear
                  value={filterStatus}
                  onChange={(v) => {
                    setFilterStatus(v)
                    setPagination((p) => ({ ...p, current: 1 }))
                  }}
                  style={{ width: 150 }}
                >
                  <Option value="active">Active</Option>
                  <Option value="inactive">Inactive</Option>
                  <Option value="suspended">Suspended</Option>
                  <Option value="pending">Pending</Option>
                </Select>
                )}
                {isContactsPage && (
                  <>
                    <Select
                      placeholder="All types"
                      allowClear
                      value={filterKind}
                      onChange={(v) => {
                        setFilterKind(v)
                        setPagination((p) => ({ ...p, current: 1 }))
                      }}
                      style={{ width: 170 }}
                      options={CONTACT_KINDS.map((k) => ({ value: k, label: CONTACT_KIND_LABELS[k] }))}
                    />
                    <Select
                      placeholder="All companies"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={filterCompany}
                      onChange={(v) => {
                        setFilterCompany(v)
                        setPagination((p) => ({ ...p, current: 1 }))
                      }}
                      style={{ width: 220 }}
                      options={[
                        { value: '__none__', label: 'No company' },
                        ...companies.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </>
                )}
                {audienceTab === 'non_customer' && (
                  <Select
                    placeholder="Filter by Role"
                    allowClear
                    value={filterRole}
                    onChange={(v) => {
                      setFilterRole(v)
                      setPagination((p) => ({ ...p, current: 1 }))
                    }}
                    style={{ width: 150 }}
                  >
                    <Option value="admin">Admin</Option>
                    <Option value="manager">Manager</Option>
                    <Option value="staff">Staff</Option>
                  </Select>
                )}
              </Space>
            </div>


            {selectedRowKeys.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  border: '1px solid #91caff',
                  borderRadius: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Typography.Text strong>
                  {selectedRowKeys.length} selected
                </Typography.Text>
                <Space wrap>
                  <Button
                    icon={<CheckCircleOutlined />}
                    loading={bulkAction === 'active'}
                    disabled={bulkAction !== null && bulkAction !== 'active'}
                    onClick={() => handleBulkStatus('active')}
                  >
                    Set active
                  </Button>
                  <Button
                    icon={<StopOutlined />}
                    loading={bulkAction === 'inactive'}
                    disabled={bulkAction !== null && bulkAction !== 'inactive'}
                    onClick={() => handleBulkStatus('inactive')}
                  >
                    Set inactive
                  </Button>
                  {isAdmin ? (
                    <Popconfirm
                      title="Deactivate selected users?"
                      description={
                        bulkDeletableCount > 0
                          ? `This will deactivate ${bulkDeletableCount} user account(s). They cannot sign in until set back to active.`
                          : 'You cannot deactivate your own account from this action. Select other users.'
                      }
                      okText="Deactivate"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancel"
                      onConfirm={handleBulkDelete}
                      disabled={bulkAction !== null || bulkDeletableCount === 0}
                    >
                      <span>
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          loading={bulkAction === 'delete'}
                          disabled={
                            bulkDeletableCount === 0 || (bulkAction !== null && bulkAction !== 'delete')
                          }
                        >
                          Bulk deactivate
                        </Button>
                      </span>
                    </Popconfirm>
                  ) : null}
                  <Button
                    type="link"
                    onClick={() => setSelectedRowKeys([])}
                    disabled={bulkAction !== null}
                  >
                    Clear selection
                  </Button>
                </Space>
              </div>
            )}

            <div
              className="ticket-surface"
              style={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <AppTable<UserRecord>
                className="ticket-table"
                columns={columns}
                dataSource={filteredUsers}
                rowKey="id"
                loading={loading}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                scroll={{ x: 'max-content' }}
                tableLayout="auto"
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  showSizeChanger: true,
                  pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                  showTotal: appTableShowTotal('users'),
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>

          <Modal
            title={editingUser ? `Edit ${noun.toLowerCase()}` : `Add ${noun.toLowerCase()}`}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
              setAvatarUrl(null)
            }}
            footer={null}
            width={800}
            style={{ top: 20 }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              onValuesChange={(changed) => {
                if (editingUser) return
                if (!('first_name' in changed) && !('last_name' in changed)) return
                const first = String(form.getFieldValue('first_name') ?? '').trim()
                const last = String(form.getFieldValue('last_name') ?? '').trim()
                const combined = [first, last].filter(Boolean).join(' ')
                form.setFieldsValue({ full_name: combined })
              }}
            >
              {editingUser && (
                <Form.Item label="Avatar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Avatar
                      size={64}
                      icon={<UserOutlined />}
                      src={avatarUrl || editingUser.avatar_url}
                    />
                    <Upload
                      beforeUpload={(file) => {
                        const isImage = file.type.startsWith('image/')
                        if (!isImage) {
                          message.error('You can only upload image files!')
                          return false
                        }
                        const isLt2M = file.size / 1024 / 1024 < 2
                        if (!isLt2M) {
                          message.error('Image must be smaller than 2MB!')
                          return false
                        }
                        handleAvatarUpload(file)
                        return false
                      }}
                      showUploadList={false}
                      accept="image/*"
                    >
                      <Button
                        icon={<UploadOutlined />}
                        loading={uploading}
                        disabled={uploading}
                      >
                        {uploading ? 'Uploading...' : 'Upload Avatar'}
                      </Button>
                    </Upload>
                  </div>
                </Form.Item>
              )}

              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="first_name" label="First name"
                  rules={[{ required: true, message: 'Please enter First name!' }]}
                  >
                    <Input placeholder="First name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="last_name" label="Last name"
                  rules={[{ required: true, message: 'Please enter Last name!' }]}
                  >
                    <Input placeholder="Last name" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="full_name"
                    label="Full Name"
                    rules={[{ required: true, message: 'Please enter full name!' }]}
                  >
                    <Input placeholder="Full Name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Please enter email!' },
                      { type: 'email', message: 'Invalid email!' }
                    ]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="Email"
                      disabled={!!editingUser}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {!editingUser && (
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[
                    { required: true, message: 'Please enter password!' },
                    { min: 6, message: 'Password must be at least 6 characters!' }
                  ]}
                >
                  <Input.Password placeholder="Password" />
                </Form.Item>
              )}

              {editingUser && isAdmin && (
                <>
                  <Form.Item
                    name="newPassword"
                    label="New Password (optional)"
                    rules={[
                      { min: 6, message: 'Password must be at least 6 characters!' },
                    ]}
                  >
                    <Input.Password placeholder="Leave blank to keep current password" />
                  </Form.Item>
                  <Form.Item
                    name="confirmPassword"
                    label="Confirm New Password"
                    dependencies={['newPassword']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const pwd = getFieldValue('newPassword')
                          if (!pwd) return Promise.resolve()
                          if (!value || pwd === value) return Promise.resolve()
                          return Promise.reject(new Error('Passwords do not match!'))
                        },
                      }),
                    ]}
                  >
                    <Input.Password placeholder="Confirm new password" />
                  </Form.Item>
                </>
              )}



              {isContactsPage && (
                <Row gutter={24}>
                  <Col span={12}>
                    <Form.Item
                      name="contact_kind"
                      label="Contact type"
                      tooltip="Automated contacts (bots / no-reply senders): their emails become Notification tickets instead of support tickets."
                    >
                      <Select
                        options={CONTACT_KINDS.map((k) => ({ value: k, label: CONTACT_KIND_LABELS[k] }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="company_id" label="Company">
                      <Select
                        placeholder="Select company (optional)"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={companies.map((c) => ({ label: c.name, value: c.id }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
              {!isCustomer && !isContactsPage && (
                <>
                  <Row gutter={24}>
                    <Col span={12}>
                      <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true, message: 'Please select role!' }]}
                      >
                        <Select placeholder="Select Role">
                          <Option value="admin">Admin</Option>
                          <Option value="manager">Manager</Option>
                          <Option value="staff">Staff</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>

                      <Form.Item
                        name="status"
                        label="Status"
                        rules={[{ required: true, message: 'Please select status!' }]}
                      >
                        <Select placeholder="Select Status">
                          <Option value="active">Active</Option>
                          <Option value="inactive">Inactive</Option>
                          <Option value="suspended">Suspended</Option>
                          <Option value="pending">Pending</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  {selectedRole === 'customer' && (
                    <Form.Item name="company_id" label="Company">
                      <Select
                        placeholder="Select Company (optional)"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={companies.map((c) => ({ label: c.name, value: c.id }))}
                      />
                    </Form.Item>
                  )}
                  {(selectedRole !== 'customer') && (
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item
                          name="department"
                          label="Department"
                        >
                          <Select placeholder="Select Department" allowClear>
                            {USER_DEPARTMENTS.map((d) => (
                              <Option key={d} value={d}>
                                {d}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="position"
                          label="Position"
                        >
                          <Select placeholder="Select Position" allowClear>
                            {USER_POSITIONS.map((p) => (
                              <Option key={p} value={p}>
                                {p}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item
                          name="bio"
                          label="Bio"
                        >
                          <TextArea rows={3} placeholder="Bio/Description" />
                        </Form.Item>
                      </Col>
                    </Row>

                  )}
                </>
              )}




              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="timezone"
                    label="Timezone"
                  >
                    <Select placeholder="Select Timezone" showSearch>
                      <Option value="UTC">UTC</Option>
                      <Option value="America/New_York">America/New_York (EST)</Option>
                      <Option value="America/Chicago">America/Chicago (CST)</Option>
                      <Option value="America/Denver">America/Denver (MST)</Option>
                      <Option value="America/Los_Angeles">America/Los_Angeles (PST)</Option>
                      <Option value="Europe/London">Europe/London (GMT)</Option>
                      <Option value="Europe/Paris">Europe/Paris (CET)</Option>
                      <Option value="Asia/Tokyo">Asia/Tokyo (JST)</Option>
                      <Option value="Asia/Shanghai">Asia/Shanghai (CST)</Option>
                      <Option value="Asia/Jakarta">Asia/Jakarta (WIB)</Option>
                      <Option value="Asia/Singapore">Asia/Singapore (SGT)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="locale"
                    label="Locale"
                  >
                    <Select placeholder="Select Locale">
                      <Option value="en">English (en)</Option>
                      <Option value="id">Indonesian (id)</Option>
                      <Option value="es">Spanish (es)</Option>
                      <Option value="fr">French (fr)</Option>
                      <Option value="de">German (de)</Option>
                      <Option value="ja">Japanese (ja)</Option>
                      <Option value="zh">Chinese (zh)</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {/* {editingUser && (
                <Form.Item
                  name="is_email_verified"
                  label="Email Verified"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              )} */}

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    {editingUser ? 'Update' : 'Create'}
                  </Button>
                  <Button onClick={() => {
                    setModalVisible(false)
                    form.resetFields()
                  }} disabled={submitting}>
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

