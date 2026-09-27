'use client'

import { CheckCircleOutlined, DisconnectOutlined, MailOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Card, Collapse,Layout, message, Space, Tag, Typography } from 'antd'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'

const { Content } = Layout
const { Title, Text } = Typography

interface Integration {
  id: string
  provider: string
  email_address: string | null
  is_active: boolean
  expires_at: string | null
  created_at: string
  last_sync_at: string | null
}

interface EmailIntegrationContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  integration: Integration | null
}

export default function EmailIntegrationContent({
  user,
  integration: initialIntegration,
}: EmailIntegrationContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(true)
  const [integration, setIntegration] = useState<Integration | null>(initialIntegration)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastDebug, setLastDebug] = useState<{ skippedDetails?: { email: string; subject: string; reason: string }[] } | null>(null)

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success === '1') {
      message.success('Google account connected successfully!')
      router.replace('/settings/email-integration', { scroll: false })
      router.refresh()
    }
    if (error) {
      const errorMessages: Record<string, string> = {
        access_denied: 'Access was denied. Please try again and grant access.',
        missing_config: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in env.',
        no_code: 'No authorization code received.',
        token_exchange_failed: 'Failed to exchange token with Google.',
        save_failed: 'Failed to save connection to database.',
        callback_failed: 'Callback failed. Please try again.',
      }
      message.error(errorMessages[error] || `Error: ${error}`)
      router.replace('/settings/email-integration', { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => {
    setIntegration(initialIntegration)
  }, [initialIntegration])

  const handleConnect = () => {
    window.location.href = '/api/email/google/connect'
  }

  const handleSyncInbox = async () => {
    if (!integration?.id) return
    setSyncing(true)
    try {
      const res = await fetch('/api/email/sync-inbox', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      const parts = []
      if (data.addedCount > 0) parts.push(`${data.addedCount} reply(ies) as comments`)
      if (data.createdCount > 0) parts.push(`${data.createdCount} new ticket(s)`)
      let msg = parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Inbox synced. No new emails found.'
      if (parts.length === 0 && data.totalFromGmail !== undefined) {
        if (data.totalFromGmail === 0) msg = 'Inbox synced. No emails in Gmail .'
        else if (data.newToProcess === 0) msg = `Inbox synced. ${data.totalFromGmail} email(s) in inbox, all already processed.`
      }
      message.success(msg)
      if (data._debug) {
        setLastDebug(data._debug)
        if (data._debug.skippedDetails?.length) {
          console.log('[Email Sync Debug]', data._debug)
        }
      } else {
        setLastDebug(null)
      }
      router.refresh()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to sync inbox')
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!integration?.id) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/email/disconnect', { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect')
      message.success('Disconnected from Google')
      setIntegration(null)
      router.refresh()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const isConnected = integration?.is_active && integration?.email_address

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <SettingsBackLink />
          <Card style={{ maxWidth: 600 }}>
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={2}>
                  <MailOutlined style={{ marginRight: 8 }} />
                  Email Integration (Shared Inbox)
                </Title>
                <Text type="secondary">
                  Connect a single Google account (e.g. support@domain.com) for the shared inbox. All agents will use this mailbox.
                </Text>
              </div>

              <div>
                <Title level={5}>Google Connection</Title>
                {isConnected ? (
                  <Space orientation="vertical" size="middle">
                    <Space>
                      <Tag icon={<CheckCircleOutlined />} color="success">Connected</Tag>
                      <Text strong>{integration.email_address}</Text>
                    </Space>
                    <Space wrap align="center">
                      <Button
                        icon={<SyncOutlined />}
                        onClick={handleSyncInbox}
                        loading={syncing}
                      >
                        Sync inbox (company replies → comments)
                      </Button>
                      {integration.last_sync_at && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Last sync: {new Date(integration.last_sync_at).toLocaleString()}
                        </Text>
                      )}
                      <Button
                        danger
                        icon={<DisconnectOutlined />}
                        onClick={handleDisconnect}
                        loading={disconnecting}
                      >
                        Disconnect
                      </Button>
                    </Space>
                  </Space>
                ) : (
                  <Space orientation="vertical">
                    <Text type="secondary">No Google account connected.</Text>
                    <Button type="primary" icon={<MailOutlined />} onClick={handleConnect}>
                      Connect Google
                    </Button>
                  </Space>
                )}
              </div>

              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local. Add callback URL to Google Cloud Console OAuth credentials: <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{typeof window !== 'undefined' ? `${window.location.origin}/api/email/google/callback` : 'https://yoursite.com/api/email/google/callback'}</code>
              </Text>

              {lastDebug?.skippedDetails?.length ? (
                <Collapse
                  size="small"
                  items={[{
                    key: '1',
                    label: `Debug: ${lastDebug.skippedDetails.length} email(s) skipped — click for details`,
                    children: (
                      <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                        {lastDebug.skippedDetails.map((d, i) => (
                          <div key={i} style={{ marginBottom: 8, padding: 4, background: '#fafafa', borderRadius: 4 }}>
                            <strong>{d.email}</strong> — {d.reason}
                            {d.subject && <div style={{ color: '#666', marginTop: 2 }}>Subject: {d.subject.slice(0, 60)}{d.subject.length > 60 ? '...' : ''}</div>}
                          </div>
                        ))}
                      </div>
                    ),
                  }]}
                />
              ) : null}
            </Space>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
