'use client'

import { SaveOutlined } from '@ant-design/icons'
import { App, Button, Skeleton, Table, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import SlaDurationInput from '@/components/settings/SlaDurationInput'
import { Chip } from '@/components/ticket/list/TicketChips'
import { formatSlaTarget } from '@/lib/sla-format'

const { Text } = Typography

type Target = { respond: number | null; resolve: number | null }
type Mapping = Record<string, Target>
type Row = { key: string; title: string; color: string | null; defaultRespond: number | null; defaultResolve: number | null }

const DEFAULT_KEY = 'default'

/** Company → SLA: how fast this client's tickets must be answered and resolved, per ticket type. */
export default function TabSla({ companyId }: { companyId: string }) {
  const { message } = App.useApp()
  const [rows, setRows] = useState<Row[]>([])
  const [saved, setSaved] = useState<Mapping>({})
  const [draft, setDraft] = useState<Mapping>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/sla`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load SLA')
      setRows([
        ...(body.types as { id: number; title: string; color: string; default_respond: number | null; default_resolve: number | null }[]).map((t) => ({
          key: String(t.id),
          title: t.title,
          color: t.color,
          defaultRespond: t.default_respond,
          defaultResolve: t.default_resolve,
        })),
        { key: DEFAULT_KEY, title: 'All other tickets', color: null, defaultRespond: null, defaultResolve: null },
      ])
      setSaved(body.mapping ?? {})
      setDraft(body.mapping ?? {})
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [companyId, message])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = useMemo(() => JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(saved)), [draft, saved])

  const set = (key: string, field: keyof Target, value: number | null) =>
    setDraft((d) => ({ ...d, [key]: { respond: d[key]?.respond ?? null, resolve: d[key]?.resolve ?? null, [field]: value } }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/sla`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: draft }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to save')
      setSaved(body.mapping ?? {})
      setDraft(body.mapping ?? {})
      message.success('SLA saved')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton active paragraph={{ rows: 5 }} />

  return (
    <section className="ticket-surface billing-section">
      <header className="billing-section__head">
        <span>Service levels (SLA)</span>
        <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => void save()} loading={saving} disabled={!dirty}>
          Save
        </Button>
      </header>
      <Text type="secondary" style={{ display: 'block', padding: '0 16px 12px', fontSize: 13 }}>
        How soon the team must send a first public reply, and how soon the ticket must be resolved, counted from when it was created. A row here wins over
        the ticket type&apos;s own default; &ldquo;All other tickets&rdquo; covers types without a row. Empty = the type&apos;s default (if any).
      </Text>
      <Table<Row>
        className="ticket-table"
        rowKey="key"
        size="small"
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'No ticket types yet' }}
        columns={[
          { title: 'Ticket type', key: 'type', width: 200, render: (_, r) => (r.color ? <Chip color={r.color}>{r.title}</Chip> : <Text strong>{r.title}</Text>) },
          {
            title: 'Respond within',
            key: 'respond',
            render: (_, r) => (
              <SlaDurationInput
                value={draft[r.key]?.respond ?? null}
                onChange={(v) => set(r.key, 'respond', v)}
                placeholder={r.defaultRespond ? `Default: ${formatSlaTarget(r.defaultRespond)}` : 'No target'}
              />
            ),
          },
          {
            title: 'Resolve within',
            key: 'resolve',
            render: (_, r) => (
              <SlaDurationInput
                value={draft[r.key]?.resolve ?? null}
                onChange={(v) => set(r.key, 'resolve', v)}
                placeholder={r.defaultResolve ? `Default: ${formatSlaTarget(r.defaultResolve)}` : 'No target'}
              />
            ),
          },
        ]}
      />
    </section>
  )
}

/** Comparable form of a mapping: rows with a target only, stable order */
function normalize(m: Mapping): [string, Target][] {
  return Object.entries(m)
    .filter(([, v]) => v.respond || v.resolve)
    .map(([k, v]): [string, Target] => [k, { respond: v.respond || null, resolve: v.resolve || null }])
    .sort(([a], [b]) => a.localeCompare(b))
}
