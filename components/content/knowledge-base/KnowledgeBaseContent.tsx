'use client'

import { DeleteOutlined,EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Layout,
  message,
  Popconfirm,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { APP_TABLE_PAGE_SIZE_OPTIONS } from '@/lib/app-table'
import { labelForKnowledgeBaseRoles } from '@/lib/knowledge-base-article-roles'

const { Content } = Layout
const { Title } = Typography

interface KnowledgeBaseContentProps {
  user: { id: string; email?: string | null; name?: string | null }
}

interface ArticleRecord {
  id: string
  title: string
  status: string
  description: string
  category: string
  sort_order: number
  target_roles?: string[] | null
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

export default function KnowledgeBaseContent({ user: currentUser }: KnowledgeBaseContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [articles, setArticles] = useState<ArticleRecord[]>([])
  const [loading, setLoading] = useState(false)

  const fetchArticles = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<ArticleRecord[]>('/api/knowledge-base-articles')
      setArticles(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch articles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles()
  }, [])

  const handleCreate = () => router.push('/settings/knowledge-base/create')
  const handleEdit = (record: ArticleRecord) => router.push(`/settings/knowledge-base/${record.id}/edit`)
  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/knowledge-base-articles/${id}`, { method: 'DELETE' })
      message.success('Article deleted')
      fetchArticles()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete article')
    }
  }

  const columns: ColumnsType<ArticleRecord> = [
    {
      title: 'Order',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 100,
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (v: string) => v || 'general',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'published' ? 'green' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Roles',
      key: 'target_roles',
      width: 160,
      ellipsis: true,
      render: (_: unknown, record: ArticleRecord) => (
        <span title={labelForKnowledgeBaseRoles(record.target_roles)}>
          {labelForKnowledgeBaseRoles(record.target_roles)}
        </span>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string) => {
        if (!v) return '—'
        const text = v.replace(/<[^>]+>/g, '').trim()
        return text ? (text.length > 80 ? text.slice(0, 80) + '...' : text) : '—'
      },
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: ArticleRecord) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm
            title="Delete article?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24 }}>
          <SettingsBackLink />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <Title level={2} style={{ margin: 0 }}>
              Knowledge Base
            </Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              Add Article
            </Button>
          </div>

          <Table
            rowKey="id"
            dataSource={articles}
            columns={columns}
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: (t) => `Total ${t} articles` }}
          />
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
