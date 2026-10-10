'use client'

import { EditOutlined, PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Input, Layout, Modal, Popconfirm, Select, Table, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import type { SkillOverview, SkillsOverview } from '@/lib/skills-admin'
import { MAX_SKILL_LENGTH } from '@/lib/user-skills'

const { Content } = Layout
const { Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

type Editing = { mode: 'new' } | { mode: 'agents'; skill: string } | { mode: 'rename'; skill: string } | null

/** Settings → Skills: every skill with who has it, where it is a default and how many tickets name it. Rename, merge, delete, assign agents. */
export default function SkillsContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [data, setData] = useState<SkillsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [name, setName] = useState('')
  const [agentIds, setAgentIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/skills', { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load skills')
      setData(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const post = async (payload: Record<string, unknown>, okText: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/skills', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed')
      message.success(okText)
      setEditing(null)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const open = (e: NonNullable<Editing>) => {
    setEditing(e)
    if (e.mode === 'new') {
      setName('')
      setAgentIds([])
    } else {
      setName(e.skill)
      setAgentIds(data?.skills.find((s) => s.skill === e.skill)?.agents.map((a) => a.id) ?? [])
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.skills ?? []).filter((s) => !q || s.skill.toLowerCase().includes(q))
  }, [data, query])

  const agentOptions = (data?.agents ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.email})` }))
  const existingKeys = new Set((data?.skills ?? []).map((s) => s.skill.toLowerCase()))
  const renameMerges = editing?.mode === 'rename' && name.trim() && name.trim().toLowerCase() !== editing.skill.toLowerCase() && existingKeys.has(name.trim().toLowerCase())

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Skills"
            description="What agents can handle. Tickets, types and tags name the skills they need; agents with them are suggested and can be auto-assigned."
            count={`${data?.skills.length ?? 0} skills`}
            actions={
              <>
                <Input allowClear prefix={<SearchOutlined />} placeholder="Search skills…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 220 }} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => open({ mode: 'new' })}>
                  New skill
                </Button>
              </>
            }
          />

          <div className="ticket-surface ticket-table">
            <Table<SkillOverview>
              rowKey="skill"
              loading={loading}
              dataSource={rows}
              pagination={rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
              scroll={{ x: 760 }}
              locale={{ emptyText: 'No skills yet. Add one with "New skill", or on a user, ticket type, tag or ticket.' }}
              columns={[
                { title: 'Skill', dataIndex: 'skill', sorter: (a, b) => a.skill.localeCompare(b.skill), render: (s: string) => <Tag style={{ marginInlineEnd: 0, fontWeight: 600 }}>{s}</Tag> },
                {
                  title: 'Agents',
                  key: 'agents',
                  render: (_, r) =>
                    r.agents.length ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Avatar.Group size={24} max={{ count: 4 }}>
                          {r.agents.map((a) => (
                            <Tooltip key={a.id} title={a.name}>
                              <Avatar>{a.name.charAt(0).toUpperCase()}</Avatar>
                            </Tooltip>
                          ))}
                        </Avatar.Group>
                        <Text className="cell-muted" style={{ fontSize: 12 }}>
                          {r.agents.length === 1 ? r.agents[0].name : `${r.agents.length} agents`}
                        </Text>
                      </span>
                    ) : (
                      <span style={{ color: '#DC2626', fontWeight: 600 }}>Nobody</span>
                    ),
                },
                {
                  title: 'Default for',
                  key: 'defaults',
                  render: (_, r) =>
                    r.types.length || r.tags.length || r.clients.length ? (
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.types.map((t) => (
                          <Tag key={`t${t.id}`} color="blue" style={{ marginInlineEnd: 0 }}>
                            {t.title}
                          </Tag>
                        ))}
                        {r.tags.map((t) => (
                          <Tag key={`g${t.id}`} style={{ marginInlineEnd: 0 }}>
                            #{t.name}
                          </Tag>
                        ))}
                        {r.clients.map((c, i) => (
                          <Tag key={`c${c.id}${i}`} color="green" style={{ marginInlineEnd: 0 }}>
                            {c.name} · {c.type}
                          </Tag>
                        ))}
                      </span>
                    ) : (
                      <span className="cell-muted">—</span>
                    ),
                },
                {
                  title: 'Tickets',
                  key: 'tickets',
                  width: 140,
                  align: 'right',
                  sorter: (a, b) => a.openTickets - b.openTickets,
                  render: (_, r) => (
                    <span title={`${r.allTickets} tickets name it in total`}>
                      <span className="cell-strong">{r.openTickets}</span>
                      <span className="cell-muted" style={{ fontSize: 12 }}> open</span>
                    </span>
                  ),
                },
                {
                  title: '',
                  key: 'actions',
                  width: 150,
                  align: 'right',
                  render: (_, r) => (
                    <span className="row-actions">
                      <Tooltip title="Who has this skill">
                        <Button type="text" size="small" icon={<TeamOutlined />} onClick={() => open({ mode: 'agents', skill: r.skill })} aria-label="Agents" />
                      </Tooltip>
                      <Tooltip title="Rename or merge">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open({ mode: 'rename', skill: r.skill })} aria-label="Rename" />
                      </Tooltip>
                      <Popconfirm
                        title={`Delete “${r.skill}”?`}
                        description={`It is removed from ${r.agents.length} agent(s), ${r.types.length + r.tags.length + r.clients.length} default(s) and ${r.allTickets} ticket(s).`}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => post({ action: 'delete', skill: r.skill }, `Deleted “${r.skill}”`)}
                      >
                        <Button type="text" size="small" danger aria-label="Delete">
                          Delete
                        </Button>
                      </Popconfirm>
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <Modal
            title={editing?.mode === 'new' ? 'New skill' : editing?.mode === 'agents' ? `Who has “${editing.skill}”` : editing?.mode === 'rename' ? `Rename “${editing.skill}”` : ''}
            open={editing !== null}
            onCancel={() => setEditing(null)}
            okText={editing?.mode === 'rename' ? (renameMerges ? 'Merge' : 'Rename') : 'Save'}
            confirmLoading={saving}
            okButtonProps={{ disabled: editing?.mode !== 'agents' && !name.trim() }}
            onOk={() => {
              if (!editing) return
              if (editing.mode === 'rename') void post({ action: 'rename', from: editing.skill, to: name }, renameMerges ? 'Skills merged' : 'Renamed')
              else void post({ action: 'set_agents', skill: editing.mode === 'new' ? name : editing.skill, user_ids: agentIds }, 'Saved')
            }}
            destroyOnHidden
          >
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              {editing?.mode !== 'agents' ? (
                <label className="mt-field">
                  <span className="mt-field__label">Name</span>
                  <Input value={name} maxLength={MAX_SKILL_LENGTH} onChange={(e) => setName(e.target.value)} placeholder="e.g. WordPress" autoFocus />
                </label>
              ) : null}
              {renameMerges ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  “{name.trim()}” already exists: the two skills are merged everywhere (agents, defaults and tickets).
                </Text>
              ) : null}
              {editing?.mode === 'rename' ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Changes the name on every agent, ticket type, tag and ticket that uses it.
                </Text>
              ) : (
                <label className="mt-field">
                  <span className="mt-field__label">Agents with this skill</span>
                  <Select
                    mode="multiple"
                    value={agentIds}
                    onChange={setAgentIds}
                    options={agentOptions}
                    optionFilterProp="label"
                    placeholder="Select agents"
                    style={{ width: '100%' }}
                  />
                </label>
              )}
            </div>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
