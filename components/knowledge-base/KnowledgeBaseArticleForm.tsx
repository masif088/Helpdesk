'use client'

import { SaveOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Layout, message, Select } from 'antd'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'
import { KNOWLEDGE_BASE_ARTICLE_ROLES, normalizeTargetRolesInput } from '@/lib/knowledge-base-article-roles'

const { Content } = Layout

const ROLE_OPTIONS = KNOWLEDGE_BASE_ARTICLE_ROLES.map((value) => ({
  label: value.charAt(0).toUpperCase() + value.slice(1),
  value,
}))

interface KnowledgeBaseArticleFormProps {
  user: { id: string; email?: string | null; name?: string | null }
  /** When set, load and edit this article */
  articleId?: string | null
  initialValues?: {
    title?: string
    status?: string
    description?: string
    category?: string
    sort_order?: number
    /** Empty = visible to all roles */
    target_roles?: string[] | null
  }
}

const CATEGORY_OPTIONS = [
  { label: 'General', value: 'general' },
  { label: 'Requests', value: 'requests' },
  { label: 'Customer service', value: 'customer service' },
]

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function KnowledgeBaseArticleForm({
  user: currentUser,
  articleId,
  initialValues,
}: KnowledgeBaseArticleFormProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const payload = {
        title: String(values.title || '').trim(),
        status: values.status || 'draft',
        description: (values.description as string)?.trim() || null,
        category: (values.category as string) || 'general',
        sort_order: Number(values.sort_order) ?? 0,
        target_roles: normalizeTargetRolesInput(values.target_roles ?? null),
      }

      if (articleId) {
        await apiFetch(`/api/knowledge-base-articles/${articleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Article updated')
      } else {
        await apiFetch('/api/knowledge-base-articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Article created')
      }
      router.push('/settings/knowledge-base')
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const isEdit = !!articleId

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, maxWidth: 800 }}>
          <BackLink href="/settings/knowledge-base" style={{ marginBottom: 16 }}>
            Knowledge base
          </BackLink>
          <Card title={isEdit ? 'Edit Article' : 'Create Article'}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                title: initialValues?.title ?? '',
                status: initialValues?.status ?? 'draft',
                description: initialValues?.description ?? '',
                category: initialValues?.category ?? 'general',
                sort_order: initialValues?.sort_order ?? 0,
                target_roles: initialValues?.target_roles?.length ? initialValues.target_roles : [],
              }}
            >
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Title is required' }]}
              >
                <Input placeholder="Article title" size="large" />
              </Form.Item>
              <Form.Item name="status" label="Status">
                <Select
                  options={[
                    { label: 'Draft', value: 'draft' },
                    { label: 'Published', value: 'published' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="category" label="Category">
                <Select options={CATEGORY_OPTIONS} />
              </Form.Item>
              <Form.Item
                name="target_roles"
                label="Visible to roles"
                tooltip="Choose who can see this article when it is published. Leave empty for all roles."
              >
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="All roles"
                  options={ROLE_OPTIONS}
                />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <CommentWysiwyg
                  placeholder="Article content / description (supports rich text)"
                  height="320px"
                  ticketId={undefined}
                />
              </Form.Item>
              <Form.Item
                name="sort_order"
                label="Sort Order"
                tooltip="Lower numbers appear first"
              >
                <Input type="number" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                  {isEdit ? 'Update Article' : 'Create Article'}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
