'use client'

import { BankOutlined, CalendarOutlined, ClockCircleOutlined, CloseOutlined, EditOutlined, GlobalOutlined, HistoryOutlined, IdcardOutlined, LockOutlined, MailOutlined, NumberOutlined, PhoneOutlined, SaveOutlined, TranslationOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Col, DatePicker, Drawer, Form, Input, Layout, message, Modal, Radio, Row, Select, Skeleton, Space, Switch, Table, Tabs, Tag, Typography, Upload } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { getUserDepartmentAccentColor, getUserPositionAccentColor, USER_DEPARTMENTS, USER_POSITIONS } from '@/lib/user-work-dropdowns'
import { uploadAvatar } from '@/utils/storage'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import BackLink from '@/components/common/BackLink'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import { confirmUserCompanyMove } from '@/components/company/confirm-user-company-move'
import DashboardHourlyActivityCard from '@/components/dashboard/DashboardHourlyActivityCard'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { Chip, StatusPill } from '@/components/ticket/list/TicketChips'
import { isAdminOrManager } from '@/lib/auth-utils'
import type { StoppedTimeSession } from '@/lib/dashboard-hourly-activity'
import type { UserTimeTrackerTicketSummary } from '@/lib/user-time-tracker-summary'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const { RangePicker } = DatePicker

/** One label + value row (same look as the company page) */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="info-field">
      <div className="info-field__label">{label}</div>
      <div className="info-field__value">{children}</div>
    </div>
  )
}

/** A titled surface; `extra` sits at the right of the title */
function Section({ title, extra, loading, children }: { title: string; extra?: React.ReactNode; loading?: boolean; children: React.ReactNode }) {
  return (
    <section className="ticket-surface billing-section" style={{ height: '100%' }}>
      <header className="billing-section__head">
        <span>{title}</span>
        {extra}
      </header>
      {loading ? <Skeleton active paragraph={{ rows: 3 }} style={{ padding: '4px 16px 16px' }} /> : children}
    </section>
  )
}

const STATUS_COLORS: Record<string, string> = { active: '#16A34A', inactive: '#94A3B8', suspended: '#DC2626', pending: '#D97706' }
const ROLE_COLORS: Record<string, string> = { admin: '#DC2626', manager: '#2563EB', staff: '#0F9D8A', user: '#0F9D8A', customer: '#7C3AED' }

const FORM_BODY = { width: '100%', padding: '4px 16px 16px' } as const

function ColoredWorkTag({ text, accent }: { text: string; accent?: string }) {
  return (
    <Tag
      style={{
        margin: 0,
        ...(accent ? { backgroundColor: accent, borderColor: accent, color: '#fff' } : {}),
      }}
    >
      {text}
    </Tag>
  )
}

interface UserDetailContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  userData: any
}

export default function UserDetailContent({ user: currentUser, userData: initialUserData }: UserDetailContentProps) {
  const isViewerCustomer = (initialUserData.role ?? '').toLowerCase() === 'customer'
  const isAdmin = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'admin'
  const router = useRouter()
  const searchParams = useSearchParams()
  const openedEditFromQueryRef = useRef(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [userData, setUserData] = useState(initialUserData)
  const isOwnProfile = String(currentUser.id) === String(userData?.id)
  const isCustomer = ((userData?.role ?? '').toLowerCase() === 'customer')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userData.avatar_url)
  const [form] = Form.useForm()
  const selectedRole = Form.useWatch('role', form)
  /** Skills group agents: set by an admin / manager, suggested from the ones already in use */
  const canEditSkills = isAdminOrManager((currentUser as { role?: string }).role)
  const [knownSkills, setKnownSkills] = useState<string[]>([])
  useEffect(() => {
    if (!canEditSkills) return
    fetch('/api/users/skills', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { skill: string }[]) => setKnownSkills(Array.isArray(rows) ? rows.map((r) => r.skill) : []))
      .catch(() => {})
  }, [canEditSkills])
  const [timeTrackerData, setTimeTrackerData] = useState<any[]>([])
  const [timeTrackerLoading, setTimeTrackerLoading] = useState(false)
  const [timeTrackerTicketSummary, setTimeTrackerTicketSummary] = useState<UserTimeTrackerTicketSummary | null>(null)
  /** When set, drawer lists time entries for this ticket only (same period as the table). */
  const [entryTimesDrawerTicketId, setEntryTimesDrawerTicketId] = useState<number | null>(null)
  const [filterPeriod, setFilterPeriod] = useState<string>('all')
  const [customDateRange, setCustomDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [overviewData, setOverviewData] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
  })
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [resetPwdModalOpen, setResetPwdModalOpen] = useState(false)
  const [resetPwdLoading, setResetPwdLoading] = useState(false)
  const [resetPwdForm] = Form.useForm()
  const [activeTabKey, setActiveTabKey] = useState('general')
  const [hourlyStopped, setHourlyStopped] = useState<StoppedTimeSession[]>([])
  const [hourlyActive, setHourlyActive] = useState<Array<{ ticket_id: number; start_time: string }>>([])

  const fetchHourlyActivityData = useCallback(async () => {
    if (!userData?.id || isCustomer) return
    try {
      const startOfMonth = dayjs().subtract(30, 'day').startOf('day').toISOString()
      const [stopped, act] = await Promise.all([
        apiFetch<StoppedTimeSession[]>(
          `/api/users/time-tracker?user_id=${userData.id}&filter=custom&start=${encodeURIComponent(startOfMonth)}&end=${encodeURIComponent(dayjs().toISOString())}&stopped_only=1&limit=500`
        ),
        apiFetch<Array<{ ticket_id: number; start_time: string }>>(
          `/api/users/time-tracker?user_id=${userData.id}&active_only=1`
        ),
      ])
      setHourlyStopped(Array.isArray(stopped) ? stopped : [])
      const list = Array.isArray(act) ? act : []
      setHourlyActive(
        list.map((t) => ({
          ticket_id: t.ticket_id,
          start_time: t.start_time,
        }))
      )
    } catch {
      setHourlyStopped([])
      setHourlyActive([])
    }
  }, [userData?.id, isCustomer])

  useEffect(() => {
    fetchHourlyActivityData()
  }, [fetchHourlyActivityData])

  useEffect(() => {
    setUserData(initialUserData)
    setAvatarUrl(initialUserData.avatar_url)
  }, [initialUserData])

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const data = await apiFetch<{ companies: { id: string; name: string }[] }>('/api/tickets/lookup')
        setCompanies(data?.companies || [])
      } catch {
        setCompanies([])
      }
    }
    fetchCompanies()
  }, [])

  const fetchTimeTrackerData = useCallback(async (filter?: string, dateRange?: [Dayjs | null, Dayjs | null] | null) => {
    if (!userData?.id) return
    setTimeTrackerLoading(true)
    try {
      let url = `/api/users/time-tracker?user_id=${userData.id}&filter=${filter || 'all'}&include_ticket_summary=1&limit=500`
      if (filter === 'week') {
        url += `&start=${dayjs().subtract(7, 'day').startOf('day').toISOString()}`
      } else if (filter === 'month') {
        url += `&start=${dayjs().subtract(30, 'day').startOf('day').toISOString()}`
      } else if (filter === 'custom' && dateRange?.[0] && dateRange?.[1]) {
        url += `&start=${dateRange[0].startOf('day').toISOString()}&end=${dateRange[1].endOf('day').toISOString()}`
      }
      const raw = await apiFetch<{ sessions: any[]; ticket_summary: UserTimeTrackerTicketSummary } | any[]>(url)
      if (Array.isArray(raw)) {
        setTimeTrackerData(raw || [])
        setTimeTrackerTicketSummary(null)
      } else {
        setTimeTrackerData(raw?.sessions || [])
        setTimeTrackerTicketSummary(raw?.ticket_summary ?? null)
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch time tracker data')
      setTimeTrackerData([])
      setTimeTrackerTicketSummary(null)
    } finally {
      setTimeTrackerLoading(false)
    }
  }, [userData?.id])

  const fetchAllTimeTrackerData = useCallback(async () => {
    if (!userData?.id) return
    try {
      const data = await apiFetch<any[]>(`/api/users/time-tracker?user_id=${userData.id}&filter=all`)

      
      // Calculate overview
      const now = dayjs()
      const todayStart = now.startOf('day')
      const weekStart = now.startOf('week')
      const monthStart = now.startOf('month')

      const dataArr = data || []
      const todayTotal = dataArr
        .filter((item: any) => {
          const startTime = dayjs(item.start_time)
          return (startTime.isAfter(todayStart) || startTime.isSame(todayStart)) && item.duration_seconds
        })
        .reduce((sum: number, item: any) => sum + (item.duration_seconds || 0), 0)

      const weekTotal = dataArr
        .filter((item: any) => {
          const startTime = dayjs(item.start_time)
          return (startTime.isAfter(weekStart) || startTime.isSame(weekStart)) && item.duration_seconds
        })
        .reduce((sum: number, item: any) => sum + (item.duration_seconds || 0), 0)

      const monthTotal = dataArr
        .filter((item: any) => {
          const startTime = dayjs(item.start_time)
          return (startTime.isAfter(monthStart) || startTime.isSame(monthStart)) && item.duration_seconds
        })
        .reduce((sum: number, item: any) => sum + (item.duration_seconds || 0), 0)

      setOverviewData({
        today: todayTotal,
        thisWeek: weekTotal,
        thisMonth: monthTotal,
      })
    } catch (error: any) {
      console.error('Failed to fetch all time tracker data:', error)
    }
  }, [userData?.id])

  useEffect(() => {
    fetchAllTimeTrackerData()
  }, [fetchAllTimeTrackerData])

  useEffect(() => {
    fetchTimeTrackerData(filterPeriod, customDateRange)
  }, [filterPeriod, customDateRange, fetchTimeTrackerData])

  const handleFilterChange = (value: string) => {
    setFilterPeriod(value)
    if (value !== 'custom') {
      setCustomDateRange(null)
    }
  }

  const handleCustomDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setCustomDateRange(dates)
    if (dates && dates[0] && dates[1]) {
      setFilterPeriod('custom')
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const formatEntryDateTime = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '—'

  const timeTrackerEntriesByLogTime = useMemo(() => {
    return [...timeTrackerData].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })
  }, [timeTrackerData])

  const drawerEntryTimesForTicket = useMemo(() => {
    if (entryTimesDrawerTicketId == null) return []
    return timeTrackerEntriesByLogTime.filter(
      (r) => Number(r.ticket_id) === entryTimesDrawerTicketId
    )
  }, [timeTrackerEntriesByLogTime, entryTimesDrawerTicketId])

  const entryTimesDrawerTicketLabel = useMemo(() => {
    if (entryTimesDrawerTicketId == null) return ''
    const fromTop = timeTrackerTicketSummary?.top_tickets?.find(
      (x) => x.ticket_id === entryTimesDrawerTicketId
    )
    const title =
      fromTop?.title ??
      timeTrackerData.find((r) => Number(r.ticket_id) === entryTimesDrawerTicketId)?.ticket?.title ??
      null
    return title ? `#${entryTimesDrawerTicketId} — ${title}` : `#${entryTimesDrawerTicketId}`
  }, [entryTimesDrawerTicketId, timeTrackerTicketSummary, timeTrackerData])

  const handleEdit = () => {
    setIsEditing(true)
    form.setFieldsValue({
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      full_name: userData.full_name || '',
      role: userData.role,
      status: userData.status,
      company_id: userData.company_id || undefined,
      phone: userData.phone || '',
      email: userData.email,
      department: userData.department || '',
      position: userData.position || '',
      skills: userData.skills ?? [],
      bio: userData.bio || '',
      timezone: userData.timezone || 'UTC',
      locale: userData.locale || 'en',
      is_email_verified: userData.is_email_verified || false,
    })
  }

  useEffect(() => {
    openedEditFromQueryRef.current = false
  }, [userData.id])

  /** From company detail: link `/settings/users/{id}?edit=1` opens edit mode directly. */
  useEffect(() => {
    if (openedEditFromQueryRef.current) return
    if (searchParams.get('edit') !== '1') return
    openedEditFromQueryRef.current = true
    setIsEditing(true)
    form.setFieldsValue({
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      full_name: userData.full_name || '',
      role: userData.role,
      status: userData.status,
      company_id: userData.company_id || undefined,
      phone: userData.phone || '',
      email: userData.email,
      department: userData.department || '',
      position: userData.position || '',
      skills: userData.skills ?? [],
      bio: userData.bio || '',
      timezone: userData.timezone || 'UTC',
      locale: userData.locale || 'en',
      is_email_verified: userData.is_email_verified || false,
    })
    router.replace(`/settings/users/${userData.id}`, { scroll: false })
  }, [searchParams, userData, form, router])

  const handleCancel = () => {
    setIsEditing(false)
    setActiveTabKey('general')
    form.resetFields()
    setAvatarUrl(userData.avatar_url)
  }

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    try {
      const result = await uploadAvatar(file, userData.id)
      
      if (result.error || !result.url) {
        message.error(result.error || 'Failed to upload avatar')
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

  const runUserPatch = async (values: any) => {
    setLoading(true)
    try {
      const updateData: any = {
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        full_name: values.full_name,
        status: values.status,
        avatar_url: avatarUrl,
        phone: values.phone || null,
        timezone: values.timezone || 'UTC',
        locale: values.locale || 'en',
        is_email_verified: values.is_email_verified || false,
        updated_at: new Date().toISOString(),
      }
      // Only an admin can change the login email (it is changed in Firebase Auth too)
      if (isAdmin && typeof values.email === 'string' && values.email.trim().toLowerCase() !== (userData.email ?? '').toLowerCase()) {
        updateData.email = values.email.trim()
      }
      if (!isViewerCustomer) {
        updateData.role = values.role
        updateData.company_id = selectedRole === 'customer' ? (values.company_id || null) : null
        if (selectedRole !== 'customer') {
          updateData.department = values.department || null
          updateData.position = values.position || null
          if (canEditSkills) updateData.skills = values.skills ?? []
          updateData.bio = values.bio || null
        }
      } else if (isViewerCustomer && isAdmin && !isOwnProfile) {
        updateData.company_id = values.company_id || null
      }

      await apiFetch(`/api/users/${userData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      setIsEditing(false)
      setActiveTabKey('general')
      message.success(isOwnProfile ? 'Profile updated successfully' : 'User updated successfully')
      router.refresh()
    } catch (error: any) {
      message.error(error.message || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (values: any) => {
    let nextCompanyId: string | null | undefined
    if (!isViewerCustomer && selectedRole === 'customer') {
      nextCompanyId = values.company_id || null
    } else if (isViewerCustomer && isAdmin && !isOwnProfile) {
      nextCompanyId = values.company_id || null
    }
    const prevCompanyId = userData.company_id || null
    if (
      nextCompanyId !== undefined &&
      nextCompanyId &&
      prevCompanyId &&
      nextCompanyId !== prevCompanyId
    ) {
      const userLabel = userData.full_name || userData.email || 'User'
      const fromName = userData.company?.name || 'company lain'
      const toName = companies.find((c) => c.id === nextCompanyId)?.name || 'company lain'
      confirmUserCompanyMove({
        userLabel,
        fromCompanyName: fromName,
        toCompanyName: toName,
        onOk: () => runUserPatch(values),
      })
      return
    }
    await runUserPatch(values)
  }

  const handleResetPassword = async (values: { newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Passwords do not match!')
      return
    }
    setResetPwdLoading(true)
    try {
      await apiFetch(`/api/users/${userData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: values.newPassword }),
      })
      message.success('Password changed successfully')
      setResetPwdModalOpen(false)
      resetPwdForm.resetFields()
    } catch (error: any) {
      message.error(error.message || 'Failed to change password')
    } finally {
      setResetPwdLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
          <BackLink href={isOwnProfile ? '/dashboard' : userData.role === 'customer' ? '/contacts' : '/settings/users'} style={{ marginBottom: 12 }}>
            {isOwnProfile ? 'Dashboard' : userData.role === 'customer' ? 'Contacts' : 'Users'}
          </BackLink>

          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <div className="company-hero">
              <div className="company-hero__row">
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar size={72} icon={<UserOutlined />} src={avatarUrl || userData.avatar_url} style={{ boxShadow: '0 6px 16px rgba(15, 23, 42, 0.18)' }} />
                  {isEditing ? (
                    <Upload
                      beforeUpload={(file) => {
                        if (!file.type.startsWith('image/')) {
                          message.error('You can only upload image files!')
                          return false
                        }
                        if (file.size / 1024 / 1024 >= 2) {
                          message.error('Image must be smaller than 2MB!')
                          return false
                        }
                        handleAvatarUpload(file)
                        return false
                      }}
                      showUploadList={false}
                      accept="image/*"
                    >
                      <Button type="primary" size="small" shape="circle" icon={<UploadOutlined />} loading={uploading} disabled={uploading} aria-label="Upload photo" style={{ position: 'absolute', right: -6, bottom: -6 }} />
                    </Upload>
                  ) : null}
                </div>

                <div className="company-hero__main">
                  {isEditing ? (
                    <Form.Item name="full_name" rules={[{ required: true, message: 'Please enter full name!' }]} style={{ marginBottom: 8, maxWidth: 420 }}>
                      <Input size="large" placeholder="Full name" style={{ fontWeight: 700 }} />
                    </Form.Item>
                  ) : (
                    <Title level={2} className="page-head__title">
                      {userData.full_name || 'N/A'}
                    </Title>
                  )}
                  <div className="company-hero__meta">
                    <StatusPill color={STATUS_COLORS[userData.status] ?? '#94A3B8'} title={userData.status ? userData.status.charAt(0).toUpperCase() + userData.status.slice(1) : 'Unknown'} />
                    {!isCustomer ? <Chip color={ROLE_COLORS[userData.role] ?? '#64748B'}>{String(userData.role ?? '').toUpperCase()}</Chip> : null}
                    {userData.email ? <a href={`mailto:${userData.email}`}>{userData.email}</a> : null}
                    {isViewerCustomer && (userData.company?.id || userData.company_id) ? (
                      <span>
                        Company · <SpaNavLink href={`/companies/${userData.company?.id ?? userData.company_id}`}><strong>{userData.company?.name ?? 'Open company'}</strong></SpaNavLink>
                      </span>
                    ) : null}
                    {!isCustomer && (userData.department || userData.position) ? (
                      <span>{[userData.department, userData.position].filter(Boolean).join(' · ')}</span>
                    ) : null}
                  </div>
                </div>

                <Space wrap>
                  {!isEditing ? (
                    <>
                      <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
                        {isOwnProfile ? 'Edit profile' : 'Edit user'}
                      </Button>
                      {isAdmin ? (
                        <Button
                          icon={<LockOutlined />}
                          onClick={() => {
                            resetPwdForm.resetFields()
                            setResetPwdModalOpen(true)
                          }}
                        >
                          Reset password
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={loading}>
                        Save changes
                      </Button>
                      <Button icon={<CloseOutlined />} onClick={handleCancel} disabled={loading}>
                        Cancel
                      </Button>
                    </>
                  )}
                </Space>
              </div>
            </div>

            <Tabs
              className="company-tabs"
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              renderTabBar={isCustomer ? () => <div style={{ display: 'none' }} /> : undefined}
              items={[
                {
                  key: 'general',
                  label: (
                    <span>
                      <UserOutlined />
                      General Info
                    </span>
                  ),
                  children: (
                    <>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Section title="Basic information">
                    {isEditing ? (
                      <Space orientation="vertical" style={FORM_BODY} size="middle">
                        {isAdmin ? (
                          <Form.Item
                            name="email"
                            label="Email"
                            tooltip="The login email. Changing it also changes it in Firebase Auth."
                            rules={[{ required: true, message: 'Required' }, { type: 'email', message: 'Enter a valid email' }]}
                          >
                            <Input prefix={<MailOutlined />} />
                          </Form.Item>
                        ) : (
                          <Form.Item label="Email">
                            <Input prefix={<MailOutlined />} value={userData.email} disabled />
                          </Form.Item>
                        )}
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="first_name" label="First name">
                              <Input placeholder="First name" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="last_name" label="Last name">
                              <Input placeholder="Last name" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item
                          name="phone"
                          label="Phone"
                          rules={[
                            {
                              pattern: /^[0-9+\-\s()]*$/,
                              message: 'Phone number can only contain numbers, +, -, spaces, and parentheses'
                            }
                          ]}
                        >
                          <Input
                            prefix={<PhoneOutlined />}
                            placeholder="Phone Number"
                            type="tel"
                          />
                        </Form.Item>
                        <Form.Item label="User ID">
                          <Input value={userData.id} disabled />
                        </Form.Item>
                      </Space>
                    ) : (
                      <div className="info-grid">
                        <Field label="Email">
                          <Space>
                            <MailOutlined />
                            <Text>{userData.email}</Text>
                          </Space>
                        </Field>
                        <Field label="First name">
                          <Text>{userData.first_name || '—'}</Text>
                        </Field>
                        <Field label="Last name">
                          <Text>{userData.last_name || '—'}</Text>
                        </Field>
                        <Field label="Full Name">
                          <Space>
                            <UserOutlined />
                            <Text>{userData.full_name || 'N/A'}</Text>
                          </Space>
                        </Field>
                        <Field label="Phone">
                          <Space>
                            <PhoneOutlined />
                            <Text>{userData.phone || 'N/A'}</Text>
                          </Space>
                        </Field>
                        <Field label="User ID">
                          <Text code style={{ fontSize: 12 }}>
                            {userData.id}
                          </Text>
                        </Field>
                        {isViewerCustomer &&
                          (userData.company?.id || userData.company_id) && (
                          <Field label="Company">
                            <Space>
                              <BankOutlined />
                              <SpaNavLink
                                href={`/companies/${userData.company?.id ?? userData.company_id}`}
                                style={{ fontWeight: 500 }}
                              >
                                {userData.company?.name ?? 'Open company'}
                              </SpaNavLink>
                            </Space>
                          </Field>
                        )}
                      </div>
                    )}
                  </Section>
                </Col>

                <Col xs={24} lg={12}>
                  <Section title="Work information">
                    {isEditing ? (
                      <Space orientation="vertical" style={FORM_BODY} size="middle">
                        {!isCustomer && selectedRole !== 'customer' && (
                          <>
                            <Form.Item name="department" label="Department">
                              <Select placeholder="Select Department" allowClear optionLabelProp="label">
                                {USER_DEPARTMENTS.map((d) => {
                                  const c = getUserDepartmentAccentColor(d) ?? '#d9d9d9'
                                  return (
                                    <Option key={d} value={d} label={d}>
                                      <Space size={8}>
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            width: 10,
                                            height: 10,
                                            borderRadius: 3,
                                            backgroundColor: c,
                                            flexShrink: 0,
                                          }}
                                        />
                                        {d}
                                      </Space>
                                    </Option>
                                  )
                                })}
                              </Select>
                            </Form.Item>
                            <Form.Item name="position" label="Position">
                              <Select placeholder="Select Position" allowClear optionLabelProp="label">
                                {USER_POSITIONS.map((p) => {
                                  const c = getUserPositionAccentColor(p) ?? '#d9d9d9'
                                  return (
                                    <Option key={p} value={p} label={p}>
                                      <Space size={8}>
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            width: 10,
                                            height: 10,
                                            borderRadius: 3,
                                            backgroundColor: c,
                                            flexShrink: 0,
                                          }}
                                        />
                                        {p}
                                      </Space>
                                    </Option>
                                  )
                                })}
                              </Select>
                            </Form.Item>
                            {canEditSkills ? (
                              <Form.Item name="skills" label="Skills" tooltip="What this agent can handle. Pick existing skills or type a new one; used to group agents.">
                                <Select
                                  mode="tags"
                                  placeholder="e.g. WordPress, Billing, SEO"
                                  tokenSeparators={[',']}
                                  maxCount={30}
                                  options={knownSkills.map((s) => ({ value: s, label: s }))}
                                />
                              </Form.Item>
                            ) : null}
                          </>
                        )}
                        <Form.Item name="timezone" label="Timezone">
                          <Select prefix={<GlobalOutlined />} placeholder="Select Timezone" showSearch>
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
                        <Form.Item name="locale" label="Locale">
                          <Select prefix={<TranslationOutlined />} placeholder="Select Locale">
                            <Option value="en">English (en)</Option>
                            <Option value="id">Indonesian (id)</Option>
                            <Option value="es">Spanish (es)</Option>
                            <Option value="fr">French (fr)</Option>
                            <Option value="de">German (de)</Option>
                            <Option value="ja">Japanese (ja)</Option>
                            <Option value="zh">Chinese (zh)</Option>
                          </Select>
                        </Form.Item>
                      </Space>
                    ) : (
                      <div className="info-grid">
                        {!isCustomer && userData.role !== 'customer' && (
                          <>
                            <Field label="Department">
                              <Space>
                                <BankOutlined />
                                {userData.department ? (
                                  <ColoredWorkTag
                                    text={userData.department}
                                    accent={getUserDepartmentAccentColor(userData.department)}
                                  />
                                ) : (
                                  <Text type="secondary">N/A</Text>
                                )}
                              </Space>
                            </Field>
                            <Field label="Position">
                              <Space>
                                <IdcardOutlined />
                                {userData.position ? (
                                  <ColoredWorkTag
                                    text={userData.position}
                                    accent={getUserPositionAccentColor(userData.position)}
                                  />
                                ) : (
                                  <Text type="secondary">N/A</Text>
                                )}
                              </Space>
                            </Field>
                            <Field label="Skills">
                              {userData.skills?.length ? (
                                <Space size={[4, 4]} wrap>
                                  {userData.skills.map((s: string) => (
                                    <Tag key={s} style={{ marginInlineEnd: 0 }}>
                                      {s}
                                    </Tag>
                                  ))}
                                </Space>
                              ) : (
                                <Text type="secondary">N/A</Text>
                              )}
                            </Field>
                          </>
                        )}
                        <Field label="Timezone">
                          <Space>
                            <GlobalOutlined />
                            <Text>{userData.timezone || 'UTC'}</Text>
                          </Space>
                        </Field>
                        <Field label="Locale">
                          <Space>
                            <TranslationOutlined />
                            <Text>{userData.locale || 'en'}</Text>
                          </Space>
                        </Field>
                      </div>
                    )}
                  </Section>
                </Col>
              </Row>

              {!isCustomer && (isEditing ? selectedRole !== 'customer' : userData.role !== 'customer') && (
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                  <Col xs={24}>
                    <Section title="Bio">
                      <div style={{ padding: '4px 16px 16px' }}>
                        {isEditing ? (
                          <Form.Item name="bio" style={{ marginBottom: 0 }}>
                            <TextArea rows={4} placeholder="Bio/Description" />
                          </Form.Item>
                        ) : (
                          <Text type={userData.bio ? undefined : 'secondary'}>{userData.bio || 'No bio available'}</Text>
                        )}
                      </div>
                    </Section>
                  </Col>
                </Row>
              )}

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} lg={12}>
                <Section title="Account">
                  {isEditing ? (
                    <Space orientation="vertical" style={FORM_BODY} size="middle">
                      <Form.Item name="is_email_verified" label="Email Verified" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      {!isCustomer && (
                        <Form.Item
                          name="role"
                          label="Role"
                          rules={[{ required: true, message: 'Please select role!' }]}
                        >
                          <Select>
                            <Option value="admin">Admin</Option>
                            <Option value="manager">Manager</Option>
                            <Option value="staff">Staff</Option>
                            <Option value="customer">Customer</Option>
                          </Select>
                        </Form.Item>
                      )}
                      <Form.Item
                        name="status"
                        label="Status"
                        rules={[{ required: true, message: 'Please select status!' }]}
                      >
                        <Select>
                          <Option value="active">Active</Option>
                          <Option value="inactive">Inactive</Option>
                          <Option value="suspended">Suspended</Option>
                          <Option value="pending">Pending</Option>
                        </Select>
                      </Form.Item>
                      {!isCustomer && selectedRole === 'customer' && (
                        <Form.Item name="company_id" label="Company">
                          <Select placeholder="Select Company (optional)" allowClear style={{ width: '100%' }}>
                            {companies.map((c) => (
                              <Option key={c.id} value={c.id}>{c.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                      {isCustomer && isAdmin && !isOwnProfile && (
                        <Form.Item name="company_id" label="Company">
                          <Select placeholder="Select Company (optional)" allowClear style={{ width: '100%' }}>
                            {companies.map((c) => (
                              <Option key={c.id} value={c.id}>{c.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                    </Space>
                  ) : (
                    <div className="info-grid">
                      <Field label="Email Verified">
                        <StatusPill color={userData.is_email_verified ? '#16A34A' : '#DC2626'} title={userData.is_email_verified ? 'Verified' : 'Not verified'} />
                      </Field>
                      {!isCustomer && (
                        <Field label="Role">
                          <Chip color={ROLE_COLORS[userData.role] ?? '#64748B'}>{String(userData.role ?? '').toUpperCase()}</Chip>
                        </Field>
                      )}
                      <Field label="Status">
                        <StatusPill color={STATUS_COLORS[userData.status] ?? '#94A3B8'} title={userData.status ? userData.status.charAt(0).toUpperCase() + userData.status.slice(1) : 'Unknown'} />
                      </Field>
                      <Field label="Company">
                        <Text>{userData.company?.name ?? '—'}</Text>
                      </Field>
                    </div>
                  )}
                </Section>
              </Col>

              <Col xs={24} lg={12}>
                <Section title="Activity">
                  <div className="info-grid">
                    <Field label="Created At">
                      <Space>
                        <CalendarOutlined />
                        <Text>
                          {userData.created_at 
                            ? new Date(userData.created_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Field>
                    <Field label="Last Updated">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.updated_at 
                            ? new Date(userData.updated_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Field>
                    <Field label="Last Login">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.last_login_at 
                            ? new Date(userData.last_login_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Never'}
                        </Text>
                      </Space>
                    </Field>
                    <Field label="Last Active">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.last_active_at 
                            ? new Date(userData.last_active_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Field>
                  </div>
                </Section>
              </Col>
            </Row>
                    </>
                  ),
                },
                {
                  key: 'time-tracker',
                  label: (
                    <span>
                      <HistoryOutlined />
                      Log Time Tracker
                    </span>
                  ),
                  children: (
                    <div>
                      {/* Overview */}
                      <div className="billing-kpis">
                        <div className="billing-kpi billing-kpi--green">
                          <span className="billing-kpi__icon"><ClockCircleOutlined /></span>
                          <div style={{ minWidth: 0 }}>
                            <div className="billing-kpi__label">Today</div>
                            <div className="billing-kpi__value">{formatDuration(overviewData.today)}</div>
                          </div>
                        </div>
                        <div className="billing-kpi billing-kpi--teal">
                          <span className="billing-kpi__icon"><ClockCircleOutlined /></span>
                          <div style={{ minWidth: 0 }}>
                            <div className="billing-kpi__label">This week</div>
                            <div className="billing-kpi__value">{formatDuration(overviewData.thisWeek)}</div>
                          </div>
                        </div>
                        <div className="billing-kpi billing-kpi--slate">
                          <span className="billing-kpi__icon"><ClockCircleOutlined /></span>
                          <div style={{ minWidth: 0 }}>
                            <div className="billing-kpi__label">This month</div>
                            <div className="billing-kpi__value">{formatDuration(overviewData.thisMonth)}</div>
                          </div>
                        </div>
                      </div>

                      {!isCustomer && (
                        <DashboardHourlyActivityCard
                          stoppedSessions={hourlyStopped}
                          activeSessions={hourlyActive}
                          style={{ marginTop: 0, marginBottom: 16 }}
                        />
                      )}

                      {/* Filter */}
                      <div className="page-toolbar" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
                        <Space wrap size="middle">
                          <Radio.Group value={filterPeriod} onChange={(e) => handleFilterChange(e.target.value)} buttonStyle="solid">
                            <Radio.Button value="all">All</Radio.Button>
                            <Radio.Button value="week">Week</Radio.Button>
                            <Radio.Button value="month">Month</Radio.Button>
                            <Radio.Button value="custom">Custom</Radio.Button>
                          </Radio.Group>
                          {filterPeriod === 'custom' ? (
                            <RangePicker value={customDateRange} onChange={handleCustomDateRangeChange} format="YYYY-MM-DD" allowClear />
                          ) : null}
                        </Space>
                        <Text type="secondary">
                          <NumberOutlined /> {timeTrackerTicketSummary?.distinct_ticket_count ?? 0} tickets in this period
                        </Text>
                      </div>
                      <Row gutter={[16, 16]}>
                        <Col xs={24}>
                        <Section title="Most reported tickets" loading={timeTrackerLoading}>
                        <Row gutter={[24, 16]} style={{ padding: '4px 16px 16px', margin: 0 }}>
                          
                          <Col xs={24} sm={24}>
                           
                            {timeTrackerTicketSummary?.top_tickets?.length ? (
                              <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                                {timeTrackerTicketSummary.top_tickets.map((t, idx) => (
                                  <div
                                    key={t.ticket_id}
                                    style={{
                                      display: 'flex',
                                      gap: 10,
                                      alignItems: 'flex-start',
                                    }}
                                  >
                                    <Text type="secondary" style={{ minWidth: 22, flexShrink: 0 }}>
                                      {idx + 1}.
                                    </Text>
                                    <Space orientation="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
                                      <SpaNavLink href={`/tickets/${t.ticket_id}`} style={{ fontWeight: 600 }}>
                                        #{t.ticket_id} {t.title || 'Untitled'}
                                      </SpaNavLink>
                                      <Text type="secondary" style={{ fontSize: 12 }}>
                                        {formatDuration(t.reported_seconds_total)} reported
                                      </Text>
                                      <Button
                                        type="link"
                                        size="small"
                                        disabled={timeTrackerLoading}
                                        style={{ padding: 0, height: 'auto', alignSelf: 'flex-start' }}
                                        onClick={() => setEntryTimesDrawerTicketId(t.ticket_id)}
                                      >
                                        Click for entry times
                                      </Button>
                                    </Space>
                                  </div>
                                ))}
                              </Space>
                            ) : (
                              <Text type="secondary">
                                {timeTrackerTicketSummary ? 'No ticket data in this period' : '—'}
                              </Text>
                            )}
                          </Col>
                        </Row>
                      </Section>

                      <Drawer
                        title={
                          entryTimesDrawerTicketId != null ? (
                            <Space orientation="vertical" size={0}>
                              <span>When entries were logged</span>
                              <Text type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>
                                {entryTimesDrawerTicketLabel}
                              </Text>
                            </Space>
                          ) : (
                            'When entries were logged'
                          )
                        }
                        placement="right"
                        width={720}
                        open={entryTimesDrawerTicketId != null}
                        onClose={() => setEntryTimesDrawerTicketId(null)}
                        destroyOnHidden={false}
                      >
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                          Sorted by when the entry was saved (newest first). Start and stop reflect the tracked work window.
                        </Text>
                        <Table<any>
                          size="small"
                          rowKey="id"
                          loading={timeTrackerLoading}
                          dataSource={drawerEntryTimesForTicket}
                          pagination={{
                            pageSize: 15,
                            showSizeChanger: true,
                            pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                            showTotal: appTableShowTotal('entries'),
                          }}
                          scroll={{ x: 'max-content' }}
                          columns={[
                            {
                              title: 'Entry saved at',
                              key: 'created_at',
                              width: 200,
                              fixed: 'left' as const,
                              render: (_: unknown, record: { created_at?: string | null }) => (
                                <Space>
                                  <CalendarOutlined />
                                  <Text>{formatEntryDateTime(record.created_at)}</Text>
                                </Space>
                              ),
                            },
                            {
                              title: 'Type',
                              dataIndex: 'tracker_type',
                              key: 'tracker_type',
                              width: 96,
                              render: (ty: string | undefined) => (
                                <Tag color={ty === 'manual' ? 'default' : 'blue'}>
                                  {ty === 'manual' ? 'Manual' : 'Timer'}
                                </Tag>
                              ),
                            },
                            {
                              title: 'Start',
                              dataIndex: 'start_time',
                              key: 'start_time',
                              width: 180,
                              render: (date: string | null) => (
                                <Text>{formatEntryDateTime(date)}</Text>
                              ),
                            },
                            {
                              title: 'Stop',
                              dataIndex: 'stop_time',
                              key: 'stop_time',
                              width: 180,
                              render: (date: string | null) =>
                                date ? (
                                  <Text>{formatEntryDateTime(date)}</Text>
                                ) : (
                                  <Tag color="processing">Active</Tag>
                                ),
                            },
                            {
                              title: 'Reported',
                              key: 'reported',
                              width: 100,
                              render: (_: unknown, record: { reported_duration_seconds?: number | null }) => {
                                const s = record.reported_duration_seconds
                                if (s == null || Number.isNaN(s)) return '—'
                                return formatDuration(Math.round(Number(s)))
                              },
                            },
                            {
                              title: 'Note',
                              dataIndex: 'note',
                              key: 'note',
                              ellipsis: true,
                              render: (note: string | null | undefined) =>
                                note ? <Text>{note}</Text> : <Text type="secondary">—</Text>,
                            },
                          ]}
                        />
                      </Drawer>
                        </Col>
                        <Col xs={24}>
                        <section className="ticket-surface ticket-table">
                        <Table
                        columns={[
                          {
                            title: 'Ticket',
                            key: 'ticket',
                            render: (_, record) => (
                              <div style={{ fontWeight: 500 }}>
                                <SpaNavLink href={`/tickets/${record.ticket?.id}`} style={{ fontWeight: 600 }}>
                                  #{record.ticket?.id || 'N/A'} - {record.ticket?.title || 'N/A'}
                                </SpaNavLink>
                              </div>
                            ),
                          },
                          {
                            title: 'Type',
                            dataIndex: 'tracker_type',
                            key: 'tracker_type',
                            width: 100,
                            render: (t: string | undefined) => (
                              <Tag color={t === 'manual' ? 'default' : 'blue'}>
                                {t === 'manual' ? 'Manual' : 'Timer'}
                              </Tag>
                            ),
                          },
                          {
                            title: 'Start Time',
                            dataIndex: 'start_time',
                            key: 'start_time',
                            render: (date: string) => (
                              <Space>
                                <ClockCircleOutlined />
                                <Text>
                                  {date 
                                    ? new Date(date).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })
                                    : 'N/A'}
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            title: 'Stop Time',
                            dataIndex: 'stop_time',
                            key: 'stop_time',
                            render: (date: string | null) => (
                              <Space>
                                <ClockCircleOutlined />
                                <Text>
                                  {date 
                                    ? new Date(date).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })
                                    : <Tag color="processing">Active</Tag>}
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            title: 'Duration',
                            dataIndex: 'duration_seconds',
                            key: 'duration_seconds',
                            render: (seconds: number | null) => {
                              if (!seconds) return <Tag color="processing">Active</Tag>
                              const hours = Math.floor(seconds / 3600)
                              const minutes = Math.floor((seconds % 3600) / 60)
                              const secs = seconds % 60
                              return (
                                <Text>
                                  {hours > 0 ? `${hours}h ` : ''}
                                  {minutes > 0 ? `${minutes}m ` : ''}
                                  {secs > 0 ? `${secs}s` : ''}
                                </Text>
                              )
                            },
                          },
                          {
                            title: 'Note',
                            dataIndex: 'note',
                            key: 'note',
                            ellipsis: true,
                            render: (note: string | null | undefined) =>
                              note ? <Text>{note}</Text> : <Text type="secondary">—</Text>,
                          },
                          {
                            title: 'Created At',
                            dataIndex: 'created_at',
                            key: 'created_at',
                            render: (date: string) => (
                              <Space>
                                <CalendarOutlined />
                                <Text>
                                  {date 
                                    ? new Date(date).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : 'N/A'}
                                </Text>
                              </Space>
                            ),
                          },
                        ]}
                        dataSource={timeTrackerData}
                        rowKey="id"
                        loading={timeTrackerLoading}
                        pagination={{
                          pageSize: 15,
                          showSizeChanger: true,
                          pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                          showTotal: appTableShowTotal('records'),
                        }}
                        locale={{
                          emptyText: 'No time tracker records found',
                        }}
                      />
                    </section>
                        </Col>
                      </Row>
                     

                      
                    </div>
                  ),
                },
              ]}
            />
          </Form>

          <Modal
            title="Reset Password"
            open={resetPwdModalOpen}
            onCancel={() => {
              setResetPwdModalOpen(false)
              resetPwdForm.resetFields()
            }}
            footer={null}
          >
            <Form
              form={resetPwdForm}
              layout="vertical"
              onFinish={handleResetPassword}
            >
              <Form.Item
                name="newPassword"
                label="New Password"
                rules={[
                  { required: true, message: 'Please enter new password!' },
                  { min: 6, message: 'Password must be at least 6 characters!' },
                ]}
              >
                <Input.Password placeholder="New password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Confirm Password"
                rules={[
                  { required: true, message: 'Please confirm password!' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                      return Promise.reject(new Error('Passwords do not match!'))
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Confirm password" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={resetPwdLoading}>
                    Change Password
                  </Button>
                  <Button
                    onClick={() => {
                      setResetPwdModalOpen(false)
                      resetPwdForm.resetFields()
                    }}
                    disabled={resetPwdLoading}
                  >
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

