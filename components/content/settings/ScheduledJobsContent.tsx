'use client'

import { CopyOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { App, Button, Layout, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { type JobRun, SCHEDULED_JOBS, type ScheduledJobKey } from '@/lib/scheduled-jobs'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

/** A scheduler run older than this is flagged "Late" (about twice the schedule). */
const LATE_AFTER_MS: Record<ScheduledJobKey, number> = {
  'sync-inbox': 15 * 60_000,
  'recurring-tickets': 15 * 60_000,
  'time-trigger': 26 * 60 * 60_000,
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  runs: Partial<Record<ScheduledJobKey, JobRun>>
  appUrl: string
  secretConfigured: boolean
  gmail: { email: string | null; active: boolean; lastSyncAt: string | null } | null
  script: string
}

function RunStatus({ job, run }: { job: ScheduledJobKey; run?: JobRun }) {
  if (!run) return <StatusPill color="#94A3B8" title="Never run" />
  if (!run.ok) return <StatusPill color="#DC2626" title={`Failed (${run.status})`} />
  const late = run.via === 'scheduler' && Date.now() - new Date(run.at).getTime() > LATE_AFTER_MS[job]
  return late ? <StatusPill color="#D97706" title="Late" /> : <StatusPill color="#16A34A" title="OK" />
}

export default function ScheduledJobsContent({ user, runs: initialRuns, appUrl, secretConfigured, gmail, script }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [running, setRunning] = useState<ScheduledJobKey | null>(null)
  const [runs, setRuns] = useState(initialRuns)

  const runNow = async (job: ScheduledJobKey) => {
    setRunning(job)
    try {
      const res = await fetch('/api/settings/scheduled-jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.run) setRuns((prev) => ({ ...prev, [job]: data.run as JobRun }))
      if (res.ok) message.success('Job finished')
      else message.error(data?.body?.error || data?.error || `Job failed (${data?.status ?? res.status})`)
    } finally {
      setRunning(null)
    }
  }

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      message.success('Script copied')
    } catch {
      message.error('Could not copy — select the text and copy it manually')
    }
  }

  const anyScheduled = Object.values(runs).some((r) => r?.via === 'scheduler')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsBackLink />
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Scheduled jobs
              </Title>
              <Text className="page-head__sub">
                Background work triggered by an external scheduler (Google Apps Script or Cloud Scheduler)
              </Text>
            </div>
          </div>

          <div className="jobs-facts">
            <div className="jobs-fact">
              <span className="jobs-fact__label">Scheduler secret</span>
              {secretConfigured ? <StatusPill color="#16A34A" title="Configured" /> : <StatusPill color="#DC2626" title="Missing" />}
            </div>
            <div className="jobs-fact">
              <span className="jobs-fact__label">Gmail</span>
              {gmail?.active ? (
                <span className="jobs-fact__value">{gmail.email ?? 'Connected'}</span>
              ) : (
                <SpaNavLink href="/settings/email-integration">Not connected — connect</SpaNavLink>
              )}
            </div>
            <div className="jobs-fact">
              <span className="jobs-fact__label">Last email sync</span>
              <span className="jobs-fact__value">{gmail?.lastSyncAt ? dayjs(gmail.lastSyncAt).fromNow() : '—'}</span>
            </div>
            <div className="jobs-fact">
              <span className="jobs-fact__label">Scheduler</span>
              {anyScheduled ? <StatusPill color="#16A34A" title="Calling in" /> : <StatusPill color="#94A3B8" title="No scheduled run yet" />}
            </div>
          </div>

          <section className="ticket-surface jobs-list">
            {SCHEDULED_JOBS.map((job) => {
              const run = runs[job.key]
              return (
                <div key={job.key} className="jobs-row">
                  <div className="jobs-row__main">
                    <div className="jobs-row__title">{job.title}</div>
                    <div className="jobs-row__desc">{job.description}</div>
                    <div className="jobs-row__meta">
                      <span className="kanban-chip">{job.schedule}</span>
                      <code>POST {job.path}</code>
                    </div>
                  </div>
                  <div className="jobs-row__run">
                    <RunStatus job={job.key} run={run} />
                    {run ? (
                      <Tooltip title={dayjs(run.at).format('DD MMM YYYY HH:mm:ss')}>
                        <span className="jobs-row__when">
                          {dayjs(run.at).fromNow()} · {run.via === 'scheduler' ? 'scheduler' : 'manual'} · {(run.durationMs / 1000).toFixed(1)}s
                        </span>
                      </Tooltip>
                    ) : null}
                    {run?.summary ? <span className="jobs-row__summary">{run.summary}</span> : null}
                  </div>
                  <Button
                    icon={<PlayCircleOutlined />}
                    loading={running === job.key}
                    disabled={!secretConfigured || (running !== null && running !== job.key)}
                    onClick={() => void runNow(job.key)}
                  >
                    Run now
                  </Button>
                </div>
              )
            })}
          </section>

          <section className="ticket-surface jobs-setup">
            <header className="billing-section__head">
              <span>Set up the scheduler (Google Apps Script, free)</span>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void copyScript()}>
                Copy script
              </Button>
            </header>
            <ol className="jobs-steps">
              <li>
                Open <a href="https://script.google.com" target="_blank" rel="noreferrer">script.google.com</a> → New project, and
                replace <code>Code.gs</code> with the script below.
              </li>
              <li>
                Project Settings → Script Properties: <code>APP_URL</code> = <code>{appUrl || 'https://your-app-url'}</code> and{' '}
                <code>CRON_SECRET</code> = the value of <code>SYNC_INBOX_CRON_SECRET</code> on the server.
              </li>
              <li>
                Select <code>installTriggers</code> → Run, and approve the permissions. Then run <code>syncInbox</code> once: this page
                shows it as a scheduler run.
              </li>
            </ol>
            <pre className="jobs-script">{script}</pre>
          </section>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
