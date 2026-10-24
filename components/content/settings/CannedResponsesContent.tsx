'use client'

import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Button, Input, Layout, Modal, Popconfirm, Radio, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { CANNED_VARIABLES, htmlToText, MAX_CONTENT, MAX_TITLE, textToHtml } from '@/lib/canned-responses'

const { Content } = Layout
const { Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  /** Admins and managers may also add replies for the whole team */
  canShare: boolean
}

type Canned = { id: string; title: string; shortcut: string; content: string; scope: 'shared' | 'personal'; usage_count: number; can_edit: boolean }

type Editing = { id: string | null; title: string; shortcut: string; text: string; scope: 'shared' | 'personal' } | null

/** Settings → Canned responses: ready-made replies for the comment box, shared with the team or just for you. */
export default function CannedResponsesContent({ user, canShare }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<Canned[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/canned-responses', { credentials: 'include', cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load canned responses')
      setRows(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => !q || `${r.title} ${r.shortcut} ${htmlToText(r.content)}`.toLowerCase().includes(q))
  }, [rows, query])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(editing.id ? `/api/canned-responses/${editing.id}` : '/api/canned-responses', {
        method: editing.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editing.title, shortcut: editing.shortcut, content: textToHtml(editing.text), scope: editing.scope }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save')
      message.success('Saved')
      setEditing(null)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/canned-responses/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return void message.error((await res.json().catch(() => ({}))).error || 'Could not delete')
    message.success('Deleted')
    await load()
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Canned responses"
            description="Ready-made replies. In a ticket, use “Canned responses” next to the comment box: the customer's name, the ticket number and your name are filled in."
            count={`${rows.length} replies`}
            actions={
              <>
                <Input allowClear prefix={<SearchOutlined />} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 220 }} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ id: null, title: '', shortcut: '', text: '', scope: canShare ? 'shared' : 'personal' })}>
                  New reply
                </Button>
              </>
            }
          />

          <div className="ticket-surface ticket-table">
            <Table<Canned>
              rowKey="id"
              loading={loading}
              dataSource={shown}
              pagination={shown.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
              scroll={{ x: 720 }}
              locale={{ emptyText: 'No canned responses yet. Add the answers you give again and again.' }}
              columns={[
                {
                  title: 'Title',
                  key: 'title',
                  render: (_, r) => (
                    <>
                      <span className="cell-strong">{r.title}</span> {r.shortcut ? <Tag style={{ marginInlineEnd: 0 }}>/{r.shortcut}</Tag> : null}
                      <div className="cell-muted" style={{ fontSize: 12.5, maxWidth: 520, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {htmlToText(r.content)}
                      </div>
                    </>
                  ),
                },
                { title: 'For', key: 'scope', width: 110, render: (_, r) => <Tag color={r.scope === 'shared' ? 'blue' : 'default'}>{r.scope === 'shared' ? 'Team' : 'Only me'}</Tag> },
                { title: 'Used', dataIndex: 'usage_count', width: 90, align: 'right', sorter: (a, b) => a.usage_count - b.usage_count },
                {
                  title: '',
                  key: 'x',
                  width: 140,
                  align: 'right',
                  render: (_, r) =>
                    r.can_edit ? (
                      <span className="row-actions">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditing({ id: r.id, title: r.title, shortcut: r.shortcut, text: htmlToText(r.content), scope: r.scope })} aria-label="Edit" />
                        <Popconfirm title="Delete this reply?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => void remove(r.id)}>
                          <Button type="text" size="small" danger aria-label="Delete">
                            Delete
                          </Button>
                        </Popconfirm>
                      </span>
                    ) : null,
                },
              ]}
            />
          </div>

          <Modal title={editing?.id ? 'Edit reply' : 'New reply'} open={editing !== null} onCancel={() => setEditing(null)} okText="Save" confirmLoading={saving} okButtonProps={{ disabled: !editing?.title.trim() || !editing?.text.trim() }} onOk={() => void save()} width={640} destroyOnHidden>
            {editing ? (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <label className="mt-field">
                  <span className="mt-field__label">Title</span>
                  <Input value={editing.title} maxLength={MAX_TITLE} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Refund policy" autoFocus />
                </label>
                <label className="mt-field">
                  <span className="mt-field__label">Shortcut (optional)</span>
                  <Input value={editing.shortcut} maxLength={30} onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })} placeholder="e.g. refund" prefix="/" />
                </label>
                <label className="mt-field">
                  <span className="mt-field__label">Reply</span>
                  <Input.TextArea value={editing.text} maxLength={MAX_CONTENT} onChange={(e) => setEditing({ ...editing, text: e.target.value })} autoSize={{ minRows: 6, maxRows: 14 }} placeholder={'Hi {{customer_name}},\n\nThanks for reaching out about ticket #{{ticket_number}}…\n\n{{agent_name}}'} />
                </label>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Plain text; an empty line starts a new paragraph. You can write{' '}
                  {CANNED_VARIABLES.map((v) => (
                    <Tag key={v.key} title={v.hint} style={{ marginInlineEnd: 4 }}>{`{{${v.key}}}`}</Tag>
                  ))}
                </Text>
                {canShare || editing.scope === 'shared' ? (
                  <Radio.Group
                    value={editing.scope}
                    onChange={(e) => setEditing({ ...editing, scope: e.target.value })}
                    disabled={!canShare}
                    options={[
                      { value: 'shared', label: 'For the whole team' },
                      { value: 'personal', label: 'Only me' },
                    ]}
                  />
                ) : null}
              </div>
            ) : null}
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
