'use client'

import { NotificationOutlined,SaveOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Layout,
  message,
  Space,
  Switch,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { RangePicker } = DatePicker

interface GlobalAnnouncementSettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

type ManageResponse = {
  message: string
  is_enabled: boolean
  starts_at: string | null
  ends_at: string | null
  currently_visible: boolean
}

export default function GlobalAnnouncementSettingsContent({
  user: currentUser,
}: GlobalAnnouncementSettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/global-announcement/manage', { credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      const data = (await res.json()) as ManageResponse
      setPreviewVisible(data.currently_visible)
      const start = data.starts_at ? dayjs(data.starts_at) : null
      const end = data.ends_at ? dayjs(data.ends_at) : null
      form.setFieldsValue({
        message: data.message ?? '',
        is_enabled: data.is_enabled,
        schedule: start && end ? ([start, end] as [Dayjs, Dayjs]) : null,
      })
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onFinish = async (values: {
    message: string
    is_enabled: boolean
    schedule: [Dayjs, Dayjs] | null
  }) => {
    setSaving(true)
    try {
      const enabled = values.is_enabled === true
      const range = values.schedule
      const body = {
        message: (values.message ?? '').trim(),
        is_enabled: enabled,
        starts_at: range?.[0]?.toISOString() ?? null,
        ends_at: range?.[1]?.toISOString() ?? null,
      }
      if (enabled && (!body.starts_at || !body.ends_at)) {
        message.warning('When enabled, choose both start and end date/time')
        setSaving(false)
        return
      }
      const res = await fetch('/api/global-announcement/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      const data = (await res.json()) as ManageResponse
      setPreviewVisible(data.currently_visible)
      message.success('Saved')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <SettingsBackLink />
          <Card loading={loading}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={2} style={{ marginTop: 0 }}>
                  <NotificationOutlined style={{ marginRight: 10 }} />
                  Global announcement
                </Title>
                <Text type="secondary">
                  When enabled, the message appears as a running banner at the top of the app for all signed-in
                  users, only between the scheduled start and end.
                </Text>
              </div>

              {previewVisible ? (
                <Alert type="success" message="This announcement is currently visible to users (within schedule)." />
              ) : (
                <Alert type="info" message="Not shown to users (disabled, outside schedule, or empty message)." />
              )}

              <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{ message: '', is_enabled: false, schedule: null }}
              >
                <Form.Item
                  name="message"
                  label="Message"
                  dependencies={['is_enabled']}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator(_, v) {
                        if (getFieldValue('is_enabled') && !String(v ?? '').trim()) {
                          return Promise.reject(new Error('Enter announcement text when enabled'))
                        }
                        return Promise.resolve()
                      },
                    }),
                  ]}
                >
                  <TextArea rows={3} placeholder="Short text for the running banner" maxLength={2000} showCount />
                </Form.Item>

                <Form.Item name="is_enabled" label="Enabled" valuePropName="checked">
                  <Switch />
                </Form.Item>

                <Form.Item name="schedule" label="Publish window (start — end)">
                  <RangePicker
                    showTime
                    format="YYYY-MM-DD HH:mm"
                    style={{ width: '100%', maxWidth: 520 }}
                  />
                </Form.Item>

                <Form.Item>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                    Save
                  </Button>
                </Form.Item>
              </Form>
            </Space>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
