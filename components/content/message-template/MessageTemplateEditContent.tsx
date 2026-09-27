'use client'

import { EyeOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Input, Layout, message, Spin, Typography } from 'antd'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import MessageTemplatePlaceholdersPanel from '@/components/message-template/MessageTemplatePlaceholdersPanel'
import MessageTemplatePreviewModal from '@/components/message-template/MessageTemplatePreviewModal'
import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'
import { StatusPill } from '@/components/ticket/list/TicketChips'

import type { MessageTemplateRow } from './MessageTemplatesContent'

const { Content } = Layout
const { Text, Title } = Typography

interface MessageTemplateEditContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null }; role?: string }
  templateId: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function MessageTemplateEditContent({
  user: currentUser,
  templateId,
}: MessageTemplateEditContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [row, setRow] = useState<MessageTemplateRow | null>(null)
  const [content, setContent] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [title, setTitle] = useState('')
  const [group, setGroup] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<MessageTemplateRow>(`/api/message-templates/${templateId}`)
      setRow(data)
      setContent(data.content ?? '')
      setEmailSubject(data.email_subject ?? '')
      setTitle(data.title ?? '')
      setGroup(data.group ?? '')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to load template')
      setRow(null)
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (row?.status !== 'active') {
      message.warning('Inactive templates are locked for now.')
      return
    }
    setSaving(true)
    try {
      if (!title.trim()) {
        message.error('Title is required')
        setSaving(false)
        return
      }
      const updated = await apiFetch<MessageTemplateRow>(`/api/message-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          group: group.trim() || 'general',
          content: content.trim() ? content : null,
          email_subject: emailSubject.trim() || null,
        }),
      })
      setRow(updated)
      message.success('Template saved')
      const fromTab = searchParams.get('from_tab') ?? updated.group
      const backUrl = fromTab
        ? `/settings/message-templates?tab=${encodeURIComponent(fromTab)}`
        : '/settings/message-templates'
      router.push(backUrl)
    } catch (e: unknown) {
      message.error((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const backTab = searchParams.get('from_tab') ?? row?.group ?? ''
  const backHref = backTab ? `/settings/message-templates?tab=${encodeURIComponent(backTab)}` : '/settings/message-templates'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <BackLink href={backHref} style={{ marginBottom: 12 }}>
            Message templates
          </BackLink>

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : !row ? (
            <div className="tpl-empty">Template not found.</div>
          ) : (
            <>
              <div className="page-head">
                <div>
                  <Title level={2} className="page-head__title">
                    {title || row.title}
                  </Title>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    {row.status === 'active' ? <StatusPill color="#16A34A" title="Active" /> : <StatusPill color="#94A3B8" title="Off" />}
                    <Text className="cell-muted" copyable={{ text: row.key, tooltips: ['Copy key', 'Copied'] }} style={{ fontSize: 12 }}>
                      {row.key}
                    </Text>
                  </span>
                </div>
              </div>

              {row.status !== 'active' ? (
                <div className="billing-note" style={{ marginBottom: 16 }}>
                  This template is off: it is not sent, and preview and editing are disabled. Turn it on in the list first.
                </div>
              ) : null}

              <div className="mt-edit-layout">
                <div className="settings-form mt-edit-main">
                  <div className="mt-edit-grid">
                    <label className="mt-field">
                      <span className="mt-field__label">Title</span>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Template title" disabled={row.status !== 'active'} />
                    </label>
                    <label className="mt-field">
                      <span className="mt-field__label">Category</span>
                      <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Requester Notification" disabled={row.status !== 'active'} />
                    </label>
                  </div>
                  <label className="mt-field">
                    <span className="mt-field__label">Email subject</span>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Leave empty to use the default subject"
                      disabled={row.status !== 'active'}
                    />
                    <span className="cell-muted" style={{ fontSize: 12 }}>
                      Subjects support <code>{'{{ ticket_id }}'}</code> and <code>{'{{ ticket_title }}'}</code>.
                    </span>
                  </label>
                  <div className="mt-field">
                    <span className="mt-field__label">Body</span>
                    <CommentWysiwyg
                      value={content}
                      onChange={setContent}
                      placeholder="Compose your template… Leave empty for no default body."
                      height="400px"
                      bgColor="#fff"
                      useSemanticHTML={false}
                    />
                  </div>
                  <div className="settings-form__footer">
                    <Button icon={<EyeOutlined />} disabled={row.status !== 'active'} onClick={() => setPreviewOpen(true)}>
                      Preview
                    </Button>
                    <span style={{ flex: 1 }} />
                    <Button onClick={() => router.push(backHref)}>Cancel</Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      disabled={row.status !== 'active'}
                      onClick={() => void save()}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <aside className="mt-edit-side">
                  <section className="ticket-surface billing-section">
                    <header className="billing-section__head">
                      <span>Details</span>
                    </header>
                    <div className="info-grid">
                      <div className="info-field">
                        <div className="info-field__label">Type</div>
                        <div className="info-field__value">{row.type.replace(/_/g, ' ')}</div>
                      </div>
                      <div className="info-field">
                        <div className="info-field__label">Key</div>
                        <div className="info-field__value" style={{ overflowWrap: 'anywhere' }}>{row.key}</div>
                      </div>
                    </div>
                  </section>
                  <MessageTemplatePlaceholdersPanel />
                </aside>
              </div>

              <MessageTemplatePreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} templateBody={content} />
            </>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
