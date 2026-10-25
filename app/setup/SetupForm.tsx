'use client'

import { LockOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Steps, Typography } from 'antd'
import { useState } from 'react'

import { signIn } from '@/lib/auth-client'

const { Title, Text } = Typography

type Values = { appName: string; name: string; email: string; password: string; confirm: string; token?: string }

export default function SetupForm({ defaultAppName, tokenRequired }: { defaultAppName: string; tokenRequired: boolean }) {
  const [form] = Form.useForm<Values>()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = async () => {
    await form.validateFields(['appName'])
    setStep(1)
  }

  const finish = async () => {
    const v = await form.validateFields()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName: v.appName, name: v.name, email: v.email, password: v.password, token: v.token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Setup failed')
      const login = await signIn(v.email, v.password)
      // The account exists now; if signing in fails for any reason the login page takes over
      window.location.href = login.ok ? '/settings' : '/login'
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0F9D8A 0%, #0B7A6B 100%)', padding: 20 }}>
      <Card style={{ width: '100%', maxWidth: 460, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8 }}>
            Welcome
          </Title>
          <Text type="secondary">This is a new installation. Two quick steps and you are in.</Text>
        </div>

        <Steps size="small" current={step} items={[{ title: 'Your app' }, { title: 'Admin account' }]} style={{ marginBottom: 24 }} />

        <Form form={form} layout="vertical" size="large" autoComplete="off" initialValues={{ appName: defaultAppName }} requiredMark={false}>
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <Form.Item name="appName" label="App name" extra="Shown in the sidebar, emails and the browser tab. You can change it later in Settings." rules={[{ required: true, whitespace: true, message: 'Enter a name for the app' }]}>
              <Input placeholder="e.g. Acme Support" maxLength={80} />
            </Form.Item>
            {tokenRequired ? (
              <Form.Item name="token" label="Setup token" extra="Set as SETUP_TOKEN on the server." rules={[{ required: true, message: 'Enter the setup token' }]}>
                <Input.Password prefix={<SafetyCertificateOutlined />} />
              </Form.Item>
            ) : null}
            <Button type="primary" block style={{ height: 44 }} onClick={() => void next()}>
              Continue
            </Button>
          </div>

          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Form.Item name="name" label="Your name" rules={[{ required: true, whitespace: true, message: 'Enter your name' }]}>
              <Input prefix={<UserOutlined />} maxLength={120} />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Invalid email' }]}>
              <Input prefix={<MailOutlined />} />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter a password' }, { min: 8, message: 'At least 8 characters' }]}>
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            <Form.Item
              name="confirm"
              label="Repeat the password"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Repeat the password' },
                ({ getFieldValue }) => ({
                  validator: (_, value) => (!value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('The passwords do not match'))),
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button style={{ height: 44 }} onClick={() => setStep(0)} disabled={busy}>
                Back
              </Button>
              <Button type="primary" block style={{ height: 44 }} loading={busy} onClick={() => void finish()}>
                Create account and start
              </Button>
            </div>
          </div>
        </Form>
      </Card>
    </div>
  )
}
