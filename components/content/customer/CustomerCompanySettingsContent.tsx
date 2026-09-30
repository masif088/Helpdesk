'use client'

import { SaveOutlined } from '@ant-design/icons'
import { App, Button, Empty, Form, Input, Layout, Space, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import TabInfo from '@/components/company/TabInfo'
import CustomerPortalTeamSection from '@/components/customer-portal/CustomerPortalTeamSection'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { StatusPill } from '@/components/ticket/list/TicketChips'

const { Content } = Layout
const { Title, Text } = Typography

function ColorPickerInput({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const hex = value || '#000000'
  return (
    <Space align="center">
      <Input type="color" value={hex} onChange={(e) => onChange?.(e.target.value)} style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }} />
      <Input value={hex} onChange={(e) => onChange?.(e.target.value)} placeholder="#000000" style={{ width: 120 }} />
    </Space>
  )
}

interface CustomerCompanySettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string; user_metadata?: { full_name?: string | null } }
  /** Full company row + relations from `getCompanyDetail` (same shape as admin company page). */
  companyData: Record<string, unknown> | null
  /** Portal admin (set by staff): may edit the company's contact details and manage portal accounts. */
  isCompanyPortalAdmin?: boolean
}

/** Customer → My company: their organization's details, who has portal access, and (portal admin) contact & branding. */
export default function CustomerCompanySettingsContent({ user, companyData, isCompanyPortalAdmin = false }: CustomerCompanySettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
          {companyData ? (
            <CompanyPanels userId={user.id} companyData={companyData} isCompanyPortalAdmin={isCompanyPortalAdmin} />
          ) : (
            <div className="ticket-surface" style={{ padding: '40px 16px' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <>
                    <div style={{ fontWeight: 600, color: 'var(--kanban-card-title)' }}>Your account is not linked to a company yet</div>
                    <Text type="secondary">Ask our team to link you, then your company details and portal accounts show up here.</Text>
                  </>
                }
              />
            </div>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

function CompanyPanels({ userId, companyData, isCompanyPortalAdmin }: { userId: string; companyData: Record<string, unknown>; isCompanyPortalAdmin: boolean }) {
  const { message } = App.useApp()
  const router = useRouter()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const companyId = String(companyData.id ?? '')
  const name = String(companyData.name ?? '')
  const email = (companyData.email as string | null) || ''
  const team = companyData.active_team_name as string | null | undefined
  const manager = companyData.active_manager_display as string | null | undefined

  const onFinish = async (values: { name: string; email?: string; color?: string }) => {
    const nextName = (values.name ?? '').trim()
    if (!nextName) {
      message.warning('Company name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: nextName,
          email: (values.email ?? '').trim() || null,
          color: (values.color || '#000000').trim() || '#000000',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      message.success('Company info saved')
      router.refresh()
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
          <div className="company-hero">
            <div className="company-hero__row">
              <span className="company-hero__mark" style={{ background: (companyData.color as string | null) || 'var(--brand-primary)' }} aria-hidden>
                {(name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="company-hero__main">
                <Title level={2} className="page-head__title">
                  {name}
                </Title>
                <div className="company-hero__meta">
                  <StatusPill color={companyData.is_active === false ? '#94A3B8' : '#16A34A'} title={companyData.is_active === false ? 'Inactive' : 'Active'} />
                  {email ? <a href={`mailto:${email}`}>{email}</a> : null}
                  {team ? <span>Support team · <strong>{team}</strong></span> : null}
                  {manager ? <span>Account manager · <strong>{manager}</strong></span> : null}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <TabInfo companyData={companyData as any} />

            <CustomerPortalTeamSection companyId={companyId} canManagePortal={isCompanyPortalAdmin} currentUserId={userId} />

            {isCompanyPortalAdmin ? (
              <section className="ticket-surface billing-section">
                <header className="billing-section__head">
                  <span>Contact &amp; branding</span>
                </header>
                <Text type="secondary" style={{ display: 'block', padding: '0 16px 12px', fontSize: 13 }}>
                  How your company appears in the portal.
                </Text>
                <Form
                  form={form}
                  layout="vertical"
                  style={{ maxWidth: 480, padding: '0 16px 8px' }}
                  onFinish={onFinish}
                  initialValues={{ name, email, color: (companyData.color as string | null) || '#000000' }}
                >
                  <Form.Item name="name" label="Company name" rules={[{ required: true, message: 'Required' }]}>
                    <Input placeholder="Company name" />
                  </Form.Item>
                  <Form.Item name="email" label="Company email">
                    <Input type="email" placeholder="contact@company.com" />
                  </Form.Item>
                  <Form.Item name="color" label="Brand color">
                    <ColorPickerInput />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                      Save changes
                    </Button>
                  </Form.Item>
                </Form>
              </section>
            ) : null}
          </div>
    </>
  )
}
