'use client'

import { Card, Layout, Spin, Typography } from 'antd'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

interface KnowledgeBaseArticleDetailProps {
  user: { id: string; email?: string | null; name?: string | null }
}

interface ArticleRecord {
  id: string
  title: string
  status: string
  description: string
  category: string
  sort_order: number
  created_at: string
  updated_at: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function KnowledgeBaseArticleDetail({ user: currentUser }: KnowledgeBaseArticleDetailProps) {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string | undefined
  const [collapsed, setCollapsed] = useState(false)
  const [article, setArticle] = useState<ArticleRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    apiFetch<ArticleRecord>(`/api/knowledge-base-articles/${id}`)
      .then((data) => setArticle(data))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  if (!id) {
    return null
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, maxWidth: 800 }}>
          <BackLink onClick={() => router.back()} style={{ marginBottom: 16 }}>
            Back
          </BackLink>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          ) : error ? (
            <Card>
              <Text type="danger">{error}</Text>
            </Card>
          ) : article ? (
            <Card>
              <Title level={2} style={{ marginTop: 0 }}>
                {article.title}
              </Title>
              <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                {article.category === 'general' ? 'General' : 'Requests'}
              </Text>
              <div
                className="kb-article-content"
                dangerouslySetInnerHTML={{ __html: article.description || '<p>No description.</p>' }}
                style={{
                  lineHeight: 1.6,
                  color: 'rgba(0,0,0,0.88)',
                }}
              />
            </Card>
          ) : null}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
