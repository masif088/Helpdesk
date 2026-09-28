'use client'

import { ArrowLeftOutlined, GlobalOutlined } from '@ant-design/icons'
import { Avatar, Button, Divider, Form, Input, Layout, message, Space, Typography } from 'antd'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { BRANDING } from '@/lib/branding'

const { Content } = Layout
const { Title, Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface BrandingForm {
  app_name: string
  app_logo_url: string
  app_favicon_url: string
  email_sender_name: string
  invoice_issuer: string
  invoice_payment_info: string
  invoice_footer: string
}

export default function AppBrandingContent({ user }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm<BrandingForm>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const logoUrl = Form.useWatch('app_logo_url', form)
  const faviconUrl = Form.useWatch('app_favicon_url', form)

  useEffect(() => {
    fetch('/api/app-settings')
      .then((r) => r.json())
      .then((data) => {
        form.setFieldsValue({
          app_name: data.app_name ?? '',
          app_logo_url: data.app_logo_url ?? '',
          app_favicon_url: data.app_favicon_url ?? '',
          email_sender_name: data.email_sender_name ?? '',
          invoice_issuer: data.invoice_issuer ?? '',
          invoice_payment_info: data.invoice_payment_info ?? '',
          invoice_footer: data.invoice_footer ?? '',
        })
      })
      .catch(() => messageApi.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [form, messageApi])

  const handleSave = async (values: BrandingForm) => {
    setSaving(true)
    try {
      const res = await fetch('/api/app-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_name: values.app_name || null,
          app_logo_url: values.app_logo_url || null,
          app_favicon_url: values.app_favicon_url || null,
          email_sender_name: values.email_sender_name || null,
          invoice_issuer: values.invoice_issuer || null,
          invoice_payment_info: values.invoice_payment_info || null,
          invoice_footer: values.invoice_footer || null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      messageApi.success('Branding saved')
    } catch {
      messageApi.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, maxWidth: 720 }}>
          <SettingsBackLink />

          <Title level={3} className="settings-section-heading" style={{ margin: '0 0 4px' }}>
            App Branding
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            Customize the app name, logo, and browser tab icon.
          </Text>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            disabled={loading}
          >
            <Form.Item
              name="app_name"
              label="App Name"
              tooltip="Shown in the browser tab title and throughout the app"
              rules={[{ required: true, message: 'App name is required' }]}
            >
              <Input placeholder={BRANDING.name} maxLength={64} />
            </Form.Item>

            <Form.Item
              name="app_logo_url"
              label="Logo URL"
              tooltip="Full URL to your logo image (PNG/SVG recommended, min 200×50px)"
            >
              <Input placeholder="https://example.com/logo.png" />
            </Form.Item>

            {logoUrl && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Preview:</Text>
                <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 8, display: 'inline-block' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo preview" style={{ maxHeight: 48, maxWidth: 240, objectFit: 'contain' }} />
                </div>
              </div>
            )}

            <Form.Item
              name="app_favicon_url"
              label="Favicon URL"
              tooltip="Full URL to your favicon (.ico, .png, or .svg — 32×32px recommended)"
            >
              <Input placeholder="https://example.com/favicon.ico" />
            </Form.Item>

            {faviconUrl && (
              <Space style={{ marginBottom: 16 }}>
                <Avatar
                  src={faviconUrl}
                  size={32}
                  icon={<GlobalOutlined />}
                  style={{ borderRadius: 4 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>Favicon preview (32×32)</Text>
              </Space>
            )}

            <Form.Item
              name="email_sender_name"
              label="Email Sender Name"
              tooltip='Display name shown in outgoing emails, e.g. "DeskTeam360 Support". If empty, only the email address is shown.'
            >
              <Input placeholder={`${BRANDING.name} Support`} maxLength={64} />
            </Form.Item>

            <Divider titlePlacement="start">Invoices</Divider>
            <Form.Item
              name="invoice_issuer"
              label="Billed by"
              tooltip="Shown at the top of invoices and receipts: business name, address, tax ID — one per line"
            >
              <Input.TextArea rows={4} placeholder={'PT Your Company\nJl. Example No. 1, Jakarta\nNPWP 00.000.000.0-000.000'} />
            </Form.Item>
            <Form.Item name="invoice_payment_info" label="Payment details" tooltip="How clients pay: bank, account number, account name">
              <Input.TextArea rows={3} placeholder={'BCA 123 456 7890\na.n. PT Your Company'} />
            </Form.Item>
            <Form.Item name="invoice_footer" label="Footer note">
              <Input placeholder="Thank you for your business." />
            </Form.Item>
            <Form.Item style={{ marginTop: 8 }}>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save branding
              </Button>
            </Form.Item>
          </Form>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
