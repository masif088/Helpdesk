'use client'

import { DisconnectOutlined, MailOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Collapse, Layout, message, Popconfirm, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import EmailSkipList from '@/components/settings/EmailSkipList'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { BRANDING } from '@/lib/branding'

const { Content } = Layout
dayjs.extend(relativeTime)

const { Text } = Typography

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
  const [collapsed, setCollapsed] = useState(false)
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
  const redirectUri = `${(BRANDING.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')}/api/email/google/callback`

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Email (Gmail)"
            description="One shared Google mailbox (e.g. support@yourdomain.com): new emails become tickets, replies become comments, and agents' replies are sent from it."
          />

          <div className="email-layout">
            <section className="ticket-surface billing-section">
              <header className="billing-section__head">
                <span>
                  <MailOutlined /> Mailbox
                </span>
                {isConnected ? <StatusPill color="#16A34A" title="Connected" /> : <StatusPill color="#94A3B8" title="Not connected" />}
              </header>
              <div style={{ padding: 16 }}>
                {isConnected ? (
                  <div className="email-connected">
                    <div className="email-connected__address">{integration.email_address}</div>
                    <div className="cell-muted" style={{ fontSize: 13 }}>
                      {integration.last_sync_at ? (
                        <Tooltip title={new Date(integration.last_sync_at).toLocaleString()}>
                          Last sync {dayjs(integration.last_sync_at).fromNow()}
                        </Tooltip>
                      ) : (
                        'Never synced'
                      )}
                      {' · '}
                      <SpaNavLink href="/settings/scheduled-jobs">Syncs every 5 minutes via the scheduler</SpaNavLink>
                    </div>
                    <div className="email-connected__actions">
                      <Button type="primary" icon={<SyncOutlined />} onClick={handleSyncInbox} loading={syncing}>
                        Sync now
                      </Button>
                      <Tooltip title="Sign in with Google again (e.g. to switch mailbox or refresh access)">
                        <Button icon={<ReloadOutlined />} onClick={handleConnect}>
                          Reconnect
                        </Button>
                      </Tooltip>
                      <Popconfirm
                        title="Disconnect this mailbox?"
                        description="Email stops turning into tickets and replies can no longer be sent until you connect again."
                        okText="Disconnect"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void handleDisconnect()}
                      >
                        <Button danger icon={<DisconnectOutlined />} loading={disconnecting}>
                          Disconnect
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                ) : (
                  <div className="email-connected">
                    <div className="cell-muted">No mailbox connected. Sign in with the Google account that receives support email.</div>
                    <div className="email-connected__actions">
                      <Button type="primary" icon={<MailOutlined />} onClick={handleConnect}>
                        Connect Google
                      </Button>
                    </div>
                  </div>
                )}

                {lastDebug?.skippedDetails?.length ? (
                  <Collapse
                    size="small"
                    style={{ marginTop: 16 }}
                    items={[
                      {
                        key: '1',
                        label: `Last sync skipped ${lastDebug.skippedDetails.length} email(s) — details`,
                        children: (
                          <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
                            {lastDebug.skippedDetails.map((d, i) => (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <strong>{d.email}</strong> — {d.reason}
                                {d.subject ? <div className="cell-muted">Subject: {d.subject.slice(0, 80)}</div> : null}
                              </div>
                            ))}
                          </div>
                        ),
                      },
                    ]}
                  />
                ) : null}
              </div>
            </section>

            <section className="ticket-surface billing-section">
              <header className="billing-section__head">
                <span>Google Cloud setup</span>
              </header>
              <div className="info-grid">
                <div className="info-field">
                  <div className="info-field__label">Redirect URI</div>
                  <div className="info-field__value">
                    <Text copyable={{ text: redirectUri, tooltips: ['Copy', 'Copied'] }} style={{ overflowWrap: 'anywhere', fontSize: 13 }}>
                      {redirectUri}
                    </Text>
                  </div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Where</div>
                  <div className="info-field__value cell-muted" style={{ fontSize: 13 }}>
                    Google Cloud Console → APIs &amp; Services → Credentials → OAuth client (Web application) → Authorized redirect URIs. The Gmail API must be enabled.
                  </div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Server env</div>
                  <div className="info-field__value cell-muted" style={{ fontSize: 13 }}>
                    <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <EmailSkipList />
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
