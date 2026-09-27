'use client'

import { PlusOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Layout, message, Modal, Popconfirm, Select, Space, Spin, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import BackLink from '@/components/common/BackLink'
import DateDisplay from '@/components/common/DateDisplay'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import ProjectKanbanTab from '@/components/content/project/ProjectKanbanTab'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { TicketRecord } from '@/components/ticket/list/types'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

interface ProjectDetailContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  projectId: string
}

interface ProjectStatusRow {
  id: number
  project_id: string
  title: string
  slug: string
  color: string
  sort_order: number
}

interface ProjectDetailResponse {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
  statuses: ProjectStatusRow[]
  board_tickets: TicketRecord[]
}

export default function ProjectDetailContent({ user: currentUser, projectId }: ProjectDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<ProjectDetailResponse | null>(null)
  const [statuses, setStatuses] = useState<ProjectStatusRow[]>([])
  const [boardTickets, setBoardTickets] = useState<TicketRecord[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [form] = Form.useForm()
  const [newTicketOpen, setNewTicketOpen] = useState(false)
  const [newTicketForm] = Form.useForm()
  const [creatingTicket, setCreatingTicket] = useState(false)

  const statusTitleById = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of statuses) m.set(s.id, s.title)
    return m
  }, [statuses])

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<ProjectDetailResponse>(`/api/projects/${projectId}`)
      setProject(data)
      setStatuses(Array.isArray(data.statuses) ? data.statuses : [])
      setBoardTickets(Array.isArray(data.board_tickets) ? data.board_tickets : [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to load project')
      setProject(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [projectId])

  const openEdit = () => {
    if (!project) return
    form.setFieldsValue({
      title: project.title,
      description: project.description || '',
    })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!project) return
    try {
      const values = await form.validateFields()
      const updated = await apiFetch<Omit<ProjectDetailResponse, 'statuses' | 'board_tickets'>>(
        `/api/projects/${project.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: values.title?.trim(),
            description: values.description?.trim() || null,
          }),
        }
      )
      setProject((p) =>
        p
          ? {
              ...p,
              ...updated,
              statuses: p.statuses,
              board_tickets: p.board_tickets,
            }
          : null
      )
      message.success('Project updated')
      setEditOpen(false)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleDeleteProject = async () => {
    if (!project) return
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      message.success('Project deleted')
      router.push('/projects')
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const submitNewTicket = async () => {
    if (!project) return
    try {
      const v = await newTicketForm.validateFields()
      setCreatingTicket(true)
      const res = await fetch('/api/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(v.title || '').trim(),
          project_id: project.id,
          project_status_id: v.project_status_id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error || 'Failed to create ticket')
      message.success(`Ticket #${json.id} created`)
      setNewTicketOpen(false)
      newTicketForm.resetFields()
      await load()
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreatingTicket(false)
    }
  }

  const activityColumns: ColumnsType<TicketRecord> = [
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_, t) => (
        <SpaNavLink href={`/tickets/${t.id}`}>
          #{t.id} {t.title}
        </SpaNavLink>
      ),
    },
    {
      title: 'Column',
      key: 'column',
      width: 160,
      render: (_, t) => {
        const sid = t.project_status_id
        return sid != null ? (statusTitleById.get(sid) ?? '—') : '—'
      },
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      width: 200,
      render: (v: string) => <DateDisplay date={v} format="detailed" />,
    },
  ]

  const tabItems = project
    ? [
        {
          key: 'board',
          label: 'Board',
          children: (
            <div style={{ marginTop: 8 }}>
              <Space style={{ marginBottom: 16 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewTicketOpen(true)}>
                  New activity (ticket)
                </Button>
              </Space>
              {statuses.length === 0 ? (
                <Text type="secondary">No status columns.</Text>
              ) : (
                <ProjectKanbanTab
                  statuses={statuses.map((s) => ({
                    id: s.id,
                    title: s.title,
                    color: s.color,
                    sort_order: s.sort_order,
                  }))}
                  boardTickets={boardTickets}
                  onRefresh={load}
                />
              )}
            </div>
          ),
        },
        {
          key: 'activities',
          label: (
            <Space>
              <UnorderedListOutlined />
              Activities
            </Space>
          ),
          children: (
            <Card size="small" style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Each activity is a project ticket; it does not appear in the main ticket list.
              </Text>
              <Table
                rowKey="id"
                size="small"
                columns={activityColumns}
                dataSource={boardTickets}
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('entries') }}
              />
            </Card>
          ),
        },
      ]
    : []

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24 }}>
          <Spin spinning={loading}>
            {!project ? (
              <Text type="danger">Project not found.</Text>
            ) : (
              <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                <Space wrap>
                  <BackLink href="/projects">Projects</BackLink>
                  <Button type="default" onClick={openEdit}>
                    Edit project
                  </Button>
                  <Popconfirm
                    title="Delete project? All activity tickets will become regular support tickets."
                    onConfirm={handleDeleteProject}
                  >
                    <Button danger>Delete project</Button>
                  </Popconfirm>
                </Space>

                <div>
                  <Title level={3} style={{ marginBottom: 4 }}>
                    {project.title}
                  </Title>
                  {project.description ? <Text type="secondary">{project.description}</Text> : null}
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">
                      Updated <DateDisplay date={project.updated_at} format="detailed" />
                    </Text>
                  </div>
                </div>

                <Tabs defaultActiveKey="board" items={tabItems} />
              </Space>
            )}
          </Spin>

          <Modal
            title="Edit project"
            open={editOpen}
            onCancel={() => setEditOpen(false)}
            onOk={submitEdit}
            destroyOnHidden
          >
            <Form form={form} layout="vertical">
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <TextArea rows={3} />
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="New activity (ticket)"
            open={newTicketOpen}
            onCancel={() => setNewTicketOpen(false)}
            onOk={() => void submitNewTicket()}
            confirmLoading={creatingTicket}
            destroyOnHidden
          >
            <Form form={newTicketForm} layout="vertical">
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input placeholder="Activity title" />
              </Form.Item>
              <Form.Item name="project_status_id" label="Status column" rules={[{ required: true }]}>
                <Select
                  placeholder="Column"
                  options={statuses
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                    .map((s) => ({ value: s.id, label: s.title }))}
                />
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
