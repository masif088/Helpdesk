'use client'

import { LockOutlined,UserOutlined } from '@ant-design/icons'
import { Alert,Button, Card, Form, Input, message, Typography } from 'antd'
import Link from 'next/link'
import { useEffect,useState } from 'react'

import ThemeToggle from '@/components/common/ThemeToggle'
import { signIn } from '@/lib/auth-client'

const { Title, Text } = Typography

interface LoginFormValues {
  email: string
  password: string
}

interface DbCheck {
  ok: boolean
  error?: string
  code?: string
  detail?: string
  hint?: string
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [dbError, setDbError] = useState<DbCheck | null>(null)
  const [sessionEndedReason, setSessionEndedReason] = useState(false)
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('reason')
      setSessionEndedReason(q === 'session_ended')
    } catch {
      setSessionEndedReason(false)
    }
  }, [])

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true)
    setDbError(null)
    try {
      const result = await signIn(values.email, values.password)

      if (!result.ok) {
        try {
          const res = await fetch('/api/auth/check-db')
          const data = (await res.json()) as DbCheck
          setDbError(data.ok ? null : data)
        } catch {
          setDbError(null)
        }

        const msg = result.error === 'CredentialsSignin'
          ? 'Invalid email or password'
          : result.error === 'Configuration'
            ? 'Sign-in is not available right now (authentication is not configured).'
            : result.error
        message.error(msg)
        return
      }

      if (result.ok) {
        message.success('Login successful!')
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        window.location.href = isMobile ? '/m/tickets' : '/dashboard'
        return
      }
    } catch {
      try {
        const res = await fetch('/api/auth/check-db')
        const data = (await res.json()) as DbCheck
        setDbError(data.ok ? null : data)
      } catch {
        setDbError({
          ok: false,
          error: 'Could not reach database check endpoint. Is the dev server running?',
        })
      }
      message.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
        }}
      >
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
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 8 }}>
            Login
          </Title>
          <Text type="secondary">
            Sign in to your account
          </Text>
        </div>

        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          {sessionEndedReason && (
            <Alert
              type="warning"
              showIcon
              message="Your session has ended"
              description="Your account was deactivated or removed. Sign in again if you still have access."
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter your email!' },
              { type: 'email', message: 'Invalid email!' }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Please enter your password!' },
              { min: 6, message: 'Password must be at least 6 characters!' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ height: 44 }}
            >
              Login
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'right' }}>
            <Link href="/forgot-password">
              <Button type="link" style={{ padding: 0, fontSize: 13 }}>
                Forgot password?
              </Button>
            </Link>
          </div>



          {dbError && !dbError.ok && (
            <Alert
              type="error"
              showIcon
              message="Cannot connect to database"
              description={
                <>
                  <Text strong>{dbError.error}</Text>
                  {dbError.code && <div>Code: {dbError.code}</div>}
                  {dbError.detail && <div>Detail: {dbError.detail}</div>}
                  {dbError.hint && <div style={{ marginTop: 8, color: '#fa8c16' }}>{dbError.hint}</div>}
                </>
              }
              style={{ marginTop: 16 }}
            />
          )}
        </Form>
      </Card>
      </div>
    </div>
  )
}
