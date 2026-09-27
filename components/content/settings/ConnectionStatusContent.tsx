'use client'

import {
  ApiOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloudServerOutlined,
  ExclamationCircleFilled,
  MailOutlined,
  MinusCircleFilled,
  ReloadOutlined,
  RobotOutlined,
  ScheduleOutlined,
} from '@ant-design/icons'
import { Button, Layout, Skeleton, Typography } from 'antd'
import dayjs from 'dayjs'
import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'

import type {
  ConnectionCheckGroup,
  ConnectionCheckResult,
  ConnectionEnvironment,
} from '@/app/api/settings/connection-check/route'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'

const { Content } = Layout
const { Title, Text } = Typography

const GROUPS: { key: ConnectionCheckGroup; title: string; icon: ReactNode; tone: string }[] = [
  { key: 'core', title: 'Core services', icon: <CloudServerOutlined />, tone: '#0F9D8A' },
  { key: 'email', title: 'Email', icon: <MailOutlined />, tone: '#6366F1' },
  { key: 'jobs', title: 'Background jobs', icon: <ScheduleOutlined />, tone: '#D97706' },
  { key: 'ai', title: 'AI', icon: <RobotOutlined />, tone: '#0EA5E9' },
]

const STATUS: Record<ConnectionCheckResult['status'], { label: string; color: string; icon: ReactNode }> = {
  ok: { label: 'OK', color: '#16A34A', icon: <CheckCircleFilled /> },
  warning: { label: 'Attention', color: '#D97706', icon: <ExclamationCircleFilled /> },
  error: { label: 'Error', color: '#DC2626', icon: <CloseCircleFilled /> },
  not_configured: { label: 'Not configured', color: '#94A3B8', icon: <MinusCircleFilled /> },
}

interface ConnectionStatusContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function ConnectionStatusContent({ user: currentUser }: ConnectionStatusContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ConnectionCheckResult[]>([])
  const [environment, setEnvironment] = useState<ConnectionEnvironment | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/connection-check', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { results: ConnectionCheckResult[]; environment: ConnectionEnvironment; checkedAt: string }
      setResults(body.results)
      setEnvironment(body.environment)
      setCheckedAt(body.checkedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed')
    } finally {
      setLoading(false)
    }
  }, [])

  // One check when the page opens; after that only on "Re-check"
  useEffect(() => {
    void runCheck()
  }, [runCheck])

  const errors = results.filter((r) => r.status === 'error').length
  const warnings = results.filter((r) => r.status === 'warning').length
  const overall: ConnectionCheckResult['status'] = errors ? 'error' : warnings ? 'warning' : 'ok'
  const overallText = errors
    ? `${errors} service${errors > 1 ? 's' : ''} failing`
    : warnings
      ? `${warnings} item${warnings > 1 ? 's' : ''} need${warnings > 1 ? '' : 's'} attention`
      : 'All systems operational'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...currentUser, role: currentUser.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsBackLink />
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Connection status
              </Title>
              <Text className="page-head__sub">Live checks of the services this app depends on</Text>
            </div>
            <div className="page-head__actions">
              {checkedAt ? <span className="page-head__count">Checked {dayjs(checkedAt).format('HH:mm:ss')}</span> : null}
              <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => void runCheck()}>
                Re-check
              </Button>
            </div>
          </div>

          {error ? (
            <div className="conn-banner" style={{ ['--tone' as string]: STATUS.error.color } as CSSProperties}>
              <span className="conn-banner__icon">{STATUS.error.icon}</span>
              <span className="conn-banner__text">Could not run the checks: {error}</span>
            </div>
          ) : results.length > 0 ? (
            <div className="conn-banner" style={{ ['--tone' as string]: STATUS[overall].color } as CSSProperties}>
              <span className="conn-banner__icon">{STATUS[overall].icon}</span>
              <span className="conn-banner__text">{overallText}</span>
              <span className="conn-banner__meta">
                {results.filter((r) => r.status === 'ok').length}/{results.length} OK
              </span>
            </div>
          ) : null}

          {loading && results.length === 0 ? (
            <div className="ticket-surface" style={{ padding: 20 }}>
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          ) : (
            <div className="conn-groups">
              {GROUPS.map((g) => {
                const items = results.filter((r) => r.group === g.key)
                if (items.length === 0) return null
                return (
                  <section key={g.key} className="settings-group" style={{ ['--tone' as string]: g.tone } as CSSProperties}>
                    <header className="settings-group__head">
                      <span className="settings-group__icon">{g.icon}</span>
                      <span className="settings-group__title">{g.title}</span>
                    </header>
                    <div className="conn-list">
                      {items.map((r) => {
                        const s = STATUS[r.status]
                        return (
                          <div key={r.key} className="conn-row" style={{ ['--status' as string]: s.color } as CSSProperties}>
                            <span className="conn-row__icon">{s.icon}</span>
                            <div className="conn-row__main">
                              <div className="conn-row__title">
                                {r.label}
                                <span className="conn-row__status">{s.label}</span>
                              </div>
                              <div className="conn-row__msg">{r.message}</div>
                            </div>
                            <div className="conn-row__side">
                              {r.latencyMs !== undefined ? <span className="conn-row__latency">{r.latencyMs} ms</span> : null}
                              {r.href && r.status !== 'ok' ? (
                                <SpaNavLink href={r.href} className="conn-row__fix">
                                  Configure
                                </SpaNavLink>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {environment ? (
            <section className="ticket-surface conn-env">
              <header className="billing-section__head">
                <span>
                  <ApiOutlined /> Environment
                </span>
              </header>
              <div className="info-grid">
                <div className="info-field">
                  <div className="info-field__label">Runtime</div>
                  <div className="info-field__value">{environment.runtime}</div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Site URL</div>
                  <div className="info-field__value">{environment.siteUrl ?? '—'}</div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Firebase project</div>
                  <div className="info-field__value">{environment.projectId ?? '—'}</div>
                </div>
                <div className="info-field">
                  <div className="info-field__label">Storage bucket</div>
                  <div className="info-field__value">{environment.bucket ?? '—'}</div>
                </div>
              </div>
            </section>
          ) : null}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
