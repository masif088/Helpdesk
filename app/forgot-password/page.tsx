'use client'

import { MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'

import BackLink from '@/components/common/BackLink'
import ThemeToggle from '@/components/common/ThemeToggle'

const { Title, Text } = Typography

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFinish = async ({ email }: { email: string }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Request failed')
      }
      setSent(true)
    } catch (err) {
      setError((err as Error).message || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <ThemeToggle variant="ghostOnDark" placement="bottomRight" />
      </div>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F9D8A 0%, #0B7A6B 100%)',
          padding: '20px',
        }}
      >
        <Card style={{ width: '100%', maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Title level={2} style={{ marginBottom: 8 }}>
              Forgot Password
            </Title>
            <Text type="secondary">
              Enter your email and we&apos;ll send you a temporary password.
            </Text>
          </div>

          {sent ? (
            <Alert
              type="success"
              showIcon
              message="Check your email"
              description="If an account exists for that email, a temporary password has been sent. Please check your inbox and sign in."
              style={{ marginBottom: 20 }}
            />
          ) : (
            <Form layout="vertical" size="large" onFinish={onFinish}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Invalid email address' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="your@email.com" />
              </Form.Item>

              {error && (
                <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
              )}

              <Form.Item style={{ marginBottom: 12 }}>
                <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44 }}>
                  Send Temporary Password
                </Button>
              </Form.Item>
            </Form>
          )}

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <BackLink href="/login">Login</BackLink>
          </div>
        </Card>
      </div>
    </div>
  )
}
