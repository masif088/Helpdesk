'use client'

import { SaveOutlined } from '@ant-design/icons'
import { App, Button, Skeleton, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import SkillsSelect from '@/components/settings/SkillsSelect'
import { Chip } from '@/components/ticket/list/TicketChips'

const { Text } = Typography

type TypeRow = { id: number; title: string; color: string; default_skills: string[] }
type Mapping = Record<string, string[]>

/** Company → Skills: the skills this client's tickets need, per ticket type. New tickets of that type get them automatically. */
export default function TabSkills({ companyId }: { companyId: string }) {
  const { message } = App.useApp()
  const [types, setTypes] = useState<TypeRow[]>([])
  const [saved, setSaved] = useState<Mapping>({})
  const [draft, setDraft] = useState<Mapping>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/skills`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load skills')
      setTypes(body.types)
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

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/skills`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: draft }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to save')
      setSaved(body.mapping ?? {})
      setDraft(body.mapping ?? {})
      message.success('Skills saved')
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
        <span>Skills by ticket type</span>
        <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => void save()} loading={saving} disabled={!dirty}>
          Save
        </Button>
      </header>
      <Text type="secondary" style={{ display: 'block', padding: '0 16px 12px', fontSize: 13 }}>
        A ticket of this client with one of these types needs the skills listed, unless it has skills of its own. They decide who is suggested and who an
        automation rule can assign. Empty = the type&apos;s default skills (if any).
      </Text>
      <Table<TypeRow>
        className="ticket-table"
        rowKey="id"
        size="small"
        dataSource={types}
        pagination={false}
        locale={{ emptyText: 'No ticket types yet' }}
        columns={[
          { title: 'Ticket type', key: 'type', width: 200, render: (_, t) => <Chip color={t.color}>{t.title}</Chip> },
          {
            title: 'Skills this client needs',
            key: 'skills',
            render: (_, t) => (
              <SkillsSelect
                value={draft[String(t.id)] ?? []}
                onChange={(skills) => setDraft((d) => ({ ...d, [String(t.id)]: skills }))}
                placeholder={t.default_skills.length ? `Default: ${t.default_skills.join(', ')}` : 'e.g. WordPress, SEO'}
              />
            ),
          },
          {
            title: 'Type default',
            key: 'default',
            width: 220,
            render: (_, t) =>
              t.default_skills.length ? (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                  {t.default_skills.map((s) => (
                    <Tag key={s} style={{ marginInlineEnd: 0 }}>
                      {s}
                    </Tag>
                  ))}
                </span>
              ) : (
                <span className="cell-muted">—</span>
              ),
          },
        ]}
      />
    </section>
  )
}

/** Comparable form of a mapping: no empty lists, stable key order */
function normalize(m: Mapping): [string, string[]][] {
  return Object.entries(m)
    .filter(([, v]) => v.length)
    .sort(([a], [b]) => a.localeCompare(b))
}
