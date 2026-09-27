'use client'

import { LockOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Layout, message,Typography } from 'antd'
import { useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { signIn, signOut } from '@/lib/auth-client'

const { Content } = Layout
const { Title, Text } = Typography

interface ChangePasswordContentProps {
  user: { id: string; email?: string | null; role?: string; user_metadata?: { full_name?: string | null } }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function ChangePasswordContent({ user }: ChangePasswordContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const onFinish = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('New password and confirm password do not match!')
      return
    }

    if (values.newPassword.length < 6) {
      message.error('New password must be at least 6 characters!')
      return
    }

    setLoading(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      })

      message.success('Password changed successfully! Redirecting…')
      form.resetFields()
      // The password change revokes existing Firebase sessions — sign in again with the new password.
      await signOut({ redirect: false })
      const result = await signIn(user.email!, values.newPassword)
      window.location.href = result.ok ? '/dashboard' : '/login'
    } catch (error) {
      message.error((error as Error).message || 'An error occurred while changing password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={{ id: user.id }}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <Title level={2}>Change Password</Title>
            <Text type="secondary">Change your account password for better security</Text>

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              style={{ marginTop: 32 }}
            >
              <Form.Item
                name="currentPassword"
                label="Current Password"
                rules={[{ required: true, message: 'Current password is required!' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Current Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="newPassword"
                label="New Password"
                rules={[
                  { required: true, message: 'New password is required!' },
                  { min: 6, message: 'Password must be at least 6 characters!' }
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="New Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="Confirm New Password"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Confirm password is required!' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Passwords do not match!'))
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Confirm New Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} size="large">
                  Change Password
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

