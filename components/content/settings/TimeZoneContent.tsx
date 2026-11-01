'use client'

import { App, Button, Layout, Select, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { isValidTimeZone, offsetLabel, zoneOffsetMinutes, zoneParts } from '@/lib/app-time'

const { Content } = Layout
const { Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  initial: string
}

const two = (n: number) => String(n).padStart(2, '0')

/** Settings → Time zone: the one zone the app uses to read dates and to write times. */
export default function TimeZoneContent({ user, initial }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [zone, setZone] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    return [...new Set([initial, 'UTC', ...list])].filter(isValidTimeZone).map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))
  }, [initial])

  const preview = useMemo(() => {
    if (!isValidTimeZone(zone)) return null
    const p = zoneParts(now, zone)
    return { clock: `${two(p.hour)}:${two(p.minute)}`, date: `${p.year}-${two(p.month)}-${two(p.day)}`, offset: offsetLabel(zoneOffsetMinutes(zone, now)) }
  }, [zone, now])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/app-settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app_timezone: zone }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setSaved(zone)
      message.success('Time zone saved')
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
        <Content className="settings-page" style={{ padding: 24, width: '100%', maxWidth: 760 }}>
          <SettingsPageHeader title="Time zone" description="The one time zone the app uses to read dates and to write times." />
          <section className="ticket-surface" style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <Text strong>App time zone</Text>
              <Select showSearch value={zone} onChange={setZone} options={zones} optionFilterProp="label" style={{ maxWidth: 360 }} />
            </div>
            {preview ? (
              <Text>
                Right now there it is <b>{preview.clock}</b> on <b>{preview.date}</b> ({preview.offset}).
              </Text>
            ) : null}
            <div>
              <Button type="primary" loading={saving} disabled={zone === saved || !isValidTimeZone(zone)} onClick={() => void save()}>
                Save
              </Button>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <Text strong>What it decides</Text>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>What a date means in filters: a ticket created at 02:00 on the 30th is on the 30th, not the 29th.</li>
                <li>Which day a ticket due date falls on in the calendar, and the hours shown in the calendar and in the team activity report.</li>
                <li>The time written in invitation emails, notifications and reminders, and the business hours of the SLA calendar.</li>
                <li>The API: a date without a time (<code>2026-11-03</code>) means that whole day in this zone. A full time with a Z or an offset is taken as it is.</li>
              </ul>
              <Text type="secondary">
                Stored times do not change: they are exact moments. Only how they are read and shown follows the zone. Everyone sees the app zone in the calendar, wherever they are.
              </Text>
            </div>
          </section>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
