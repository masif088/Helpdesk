'use client'

import { App, Button, DatePicker, Layout, Select, Switch, Tag, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import type { SlaCalendar } from '@/lib/sla-calendar'

const { Content } = Layout
const { Title, Text } = Typography

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** Monday first on screen; values stay 0 = Sunday */
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const OFFSETS = Array.from({ length: 27 }, (_, i) => (i - 12) * 60).map((m) => ({
  value: m,
  label: `UTC${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:00`,
}))
const TIME_FORMAT = 'HH:mm'

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  initial: SlaCalendar
}

export default function SlaCalendarContent({ user, initial }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [cal, setCal] = useState<SlaCalendar>(initial)
  const [saving, setSaving] = useState(false)

  const setDay = (i: number, patch: { open?: string; close?: string } | null) =>
    setCal((c) => ({
      ...c,
      week: c.week.map((d, idx) => (idx !== i ? d : patch === null ? null : { open: d?.open ?? '09:00', close: d?.close ?? '17:00', ...patch })),
    }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/app-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sla_calendar: cal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save')
      message.success('SLA calendar saved')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsBackLink />
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                SLA calendar
              </Title>
              <Text className="page-head__sub">
                When SLA clocks run. Off: every minute counts. On: only the opening hours below count, and holidays are skipped. A clock
                always stops while a ticket is in a status where the ball is with the client. Holidays added in the Calendar count too.
              </Text>
            </div>
          </div>

          <section className="ticket-surface" style={{ padding: 20, display: 'grid', gap: 20, maxWidth: 720 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch checked={cal.enabled} onChange={(enabled) => setCal((c) => ({ ...c, enabled }))} />
              <span>Only count business hours</span>
            </label>

            <div style={{ display: 'grid', gap: 8, opacity: cal.enabled ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 110 }}>Time zone</span>
                <Select
                  style={{ width: 160 }}
                  value={cal.utcOffsetMinutes}
                  options={OFFSETS}
                  onChange={(utcOffsetMinutes) => setCal((c) => ({ ...c, utcOffsetMinutes }))}
                  disabled={!cal.enabled}
                />
              </div>
              {ORDER.map((i) => {
                const d = cal.week[i]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 110 }}>{DAYS[i]}</span>
                    <Switch size="small" checked={!!d} disabled={!cal.enabled} onChange={(on) => setDay(i, on ? {} : null)} />
                    {d ? (
                      <TimePicker.RangePicker
                        format={TIME_FORMAT}
                        minuteStep={15}
                        allowClear={false}
                        disabled={!cal.enabled}
                        value={[dayjs(d.open, TIME_FORMAT), dayjs(d.close, TIME_FORMAT)]}
                        onChange={(v) => v?.[0] && v[1] && setDay(i, { open: v[0].format(TIME_FORMAT), close: v[1].format(TIME_FORMAT) })}
                      />
                    ) : (
                      <Text type="secondary">Closed</Text>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'grid', gap: 8, opacity: cal.enabled ? 1 : 0.5 }}>
              <span>Holidays (no clock runs)</span>
              <DatePicker
                style={{ width: 200 }}
                placeholder="Add a holiday"
                disabled={!cal.enabled}
                value={null}
                onChange={(v: Dayjs | null) => v && setCal((c) => ({ ...c, holidays: [...new Set([...c.holidays, v.format('YYYY-MM-DD')])].sort() }))}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cal.holidays.length ? (
                  cal.holidays.map((h) => (
                    <Tag key={h} closable={cal.enabled} onClose={() => setCal((c) => ({ ...c, holidays: c.holidays.filter((x) => x !== h) }))}>
                      {dayjs(h).format('ddd D MMM YYYY')}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary">No holidays yet</Text>
                )}
              </div>
            </div>

            <div>
              <Button type="primary" loading={saving} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </section>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
