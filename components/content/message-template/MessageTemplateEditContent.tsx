'use client'

import { EyeOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Input, Layout, message, Space, Spin, Typography } from 'antd'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import MessageTemplatePlaceholdersPanel from '@/components/message-template/MessageTemplatePlaceholdersPanel'
import MessageTemplatePreviewModal from '@/components/message-template/MessageTemplatePreviewModal'
import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'

import type { MessageTemplateRow } from './MessageTemplatesContent'

const { Content } = Layout
const { Text } = Typography

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: 24 }}>
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Space wrap>
                <BackLink
                  href={
                    searchParams.get('from_tab')
                      ? `/settings/message-templates?tab=${encodeURIComponent(searchParams.get('from_tab') ?? '')}`
                      : '/settings/message-templates'
                  }
                >
                  Message templates
                </BackLink>
              </Space>

              {loading ? (
                <Spin />
              ) : !row ? (
                <Text type="danger">Template not found.</Text>
              ) : (
                <>
                  <div>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div>
                        <Text strong style={{ display: 'block', marginBottom: 4 }}>Title</Text>
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Template title"
                          disabled={row.status !== 'active'}
                        />
                      </div>
                      <div>
                        <Text strong style={{ display: 'block', marginBottom: 4 }}>Category (Group)</Text>
                        <Input
                          value={group}
                          onChange={(e) => setGroup(e.target.value)}
                          placeholder="e.g. agent_notifications, requester_notifications"
                          disabled={row.status !== 'active'}
                        />
                      </div>
                      <Space direction="vertical" size={0}>
                        <Text type="secondary" copyable={{ text: row.key }}>
                          <strong>Key:</strong> {row.key}
                        </Text>
                        <Text type="secondary">
                          <strong>Type:</strong> {row.type}
                        </Text>
                        <Text type="secondary">
                          <strong>Status:</strong> {row.status === 'active' ? 'Active' : 'Inactive'}
                        </Text>
                      </Space>
                    </Space>
                  </div>

                  <MessageTemplatePlaceholdersPanel />

                  {row.status !== 'active' && (
                    <Text type="warning" style={{ display: 'block' }}>
                      This template is inactive. Preview and edit are temporarily disabled.
                    </Text>
                  )}

                  <div style={{ marginTop: 20 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Email Subject
                    </Text>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Leave empty to use the default subject"
                      disabled={row.status !== 'active'}
                      style={{ marginBottom: 4 }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Supports merge fields e.g. <code>{'{{ recipient.full_name }}'}</code>, <code>{'{{ ticket_id }}'}</code>
                    </Text>
                  </div>

                  <div style={{ paddingBottom: 20 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Body (rich text)
                    </Text>
                    <CommentWysiwyg
                      value={content}
                      onChange={setContent}
                      placeholder="Compose your template… Leave empty for no default body."
                      height="400px"
                      bgColor="#fff"
                      useSemanticHTML={false}
                    />
                  </div>

                  <Space wrap>
                    <Button
                      icon={<EyeOutlined />}
                      disabled={row.status !== 'active'}
                      onClick={() => setPreviewOpen(true)}
                    >
                      Preview
                    </Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      disabled={row.status !== 'active'}
                      onClick={() => void save()}
                    >
                      Save and return to list
                    </Button>
                    <Button onClick={() => {
                      const fromTab = searchParams.get('from_tab') ?? row?.group
                      const backUrl = fromTab
                        ? `/settings/message-templates?tab=${encodeURIComponent(fromTab)}`
                        : '/settings/message-templates'
                      router.push(backUrl)
                    }}>Cancel</Button>
                  </Space>

                  <MessageTemplatePreviewModal
                    open={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                    templateBody={content}
                  />
                </>
              )}
            </Space>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
