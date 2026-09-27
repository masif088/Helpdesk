'use client'

import { DeleteOutlined, EditOutlined, EyeOutlined, MinusCircleOutlined, PlusOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import type { ColumnsType } from 'antd/es/table'

import DateDisplay from '@/components/common/DateDisplay'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { canAdminTeams } from '@/lib/auth-utils'
import {
  formatTeamVisibilityLabel,
  parseTeamVisibility,
  TEAM_VISIBILITY_OPTIONS,
} from '@/lib/team-type'

const { Content } = Layout
const { Title, Text } = Typography

/** Maksimal 2 angka di belakang koma */
interface TeamsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface TeamRecord {
  id: string
  name: string
  type: string | null
  created_by: string
  created_at: string
  creator_name?: string
  member_count?: number
  members?: TeamMember[]
}

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  joined_at: string
  user_name?: string
  user_email?: string
  user_avatar_url?: string | null
}

interface CompanyListRow {
  id: string
  name: string | null
  active_team_id: string | null
}

interface CompanyActivePlanRow {
  key: string
  no: number
  company_label: string
}

/** Header tints — cycle for each team block */
const TEAM_PLAN_HEADER_COLORS = ['#e6f4ff', '#fff7e6', '#f9f0ff', '#e6fffb', '#fff1f0', '#f6ffed']

interface TeamPlanGroup {
  teamId: string
  teamName: string
  headerColor: string
  rows: CompanyActivePlanRow[]
}

interface UserOption { id: string; label: string }

export default function TeamsContent({ user: currentUser }: TeamsContentProps) {
  const isAdmin = canAdminTeams(currentUser.role)
  const [collapsed, setCollapsed] = useState(false)
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [teamPlanGroups, setTeamPlanGroups] = useState<TeamPlanGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Members modal state
  const [membersTeam, setMembersTeam] = useState<TeamRecord | null>(null)
  const [membersList, setMembersList] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const fetchTeams = async () => {
    setLoading(true)
    try {
      const [teamsWithMembers, companiesRes] = await Promise.all([
        apiFetch<TeamRecord[]>('/api/teams'),
        fetch('/api/companies', { credentials: 'include' }),
      ])
      setTeams(teamsWithMembers)

      const teamNameById = new Map(teamsWithMembers.map((t) => [t.id, t.name]))
      if (companiesRes.ok) {
        const cJson = (await companiesRes.json()) as { data?: CompanyListRow[] }
        const list = Array.isArray(cJson.data) ? cJson.data : []
        const withTeam = list.filter((c) => {
          const tid = c.active_team_id
          return typeof tid === 'string' && tid.trim().length > 0
        })
        const byTeam = new Map<string, CompanyListRow[]>()
        for (const c of withTeam) {
          const tid = c.active_team_id as string
          if (!byTeam.has(tid)) byTeam.set(tid, [])
          byTeam.get(tid)!.push(c)
        }
        const groups: TeamPlanGroup[] = []
        let colorIdx = 0
        for (const [teamId, teamCompanies] of byTeam) {
          const teamName = teamNameById.get(teamId) ?? 'Unknown team'
          teamCompanies.sort((a, b) =>
            String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
          )
          const rows: CompanyActivePlanRow[] = teamCompanies.map((c, idx) => {
            const cname = (c.name ?? '').trim() || `Company ${c.id.slice(0, 8)}…`
            return {
              key: c.id,
              no: idx + 1,
              company_label: cname,
            }
          })
          groups.push({
            teamId,
            teamName,
            headerColor: TEAM_PLAN_HEADER_COLORS[colorIdx % TEAM_PLAN_HEADER_COLORS.length],
            rows,
          })
          colorIdx += 1
        }
        groups.sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' }))
        setTeamPlanGroups(groups)
      } else {
        setTeamPlanGroups([])
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch teams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeams()
  }, [])

  const handleCreate = () => {
    setEditingTeam(null)
    form.resetFields()
    form.setFieldsValue({ type: 'public' })
    setModalVisible(true)
  }

  const handleEdit = (record: TeamRecord) => {
    setEditingTeam(record)
    form.setFieldsValue({
      name: record.name,
      type: parseTeamVisibility(record.type) ?? undefined,
    })
    setModalVisible(true)
  }

  const handleDelete = async (teamId: string) => {
    try {
      await apiFetch(`/api/teams/${teamId}`, { method: 'DELETE' })
      message.success('Team deleted successfully')
      fetchTeams()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete team')
    }
  }

  const handleSubmit = async (values: any) => {
    setSubmitting(true)
    try {
      if (editingTeam) {
        await apiFetch(`/api/teams/${editingTeam.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, type: values.type }),
        })
        message.success('Team updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTeams()
      } else {
        await apiFetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, type: values.type }),
        })
        message.success('Team created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTeams()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save team')
    } finally {
      setSubmitting(false)
    }
  }

  const openMembersModal = async (team: TeamRecord) => {
    setMembersTeam(team)
    setSelectedUserIds([])
    setMembersLoading(true)
    try {
      const [membersRes, usersRes] = await Promise.all([
        apiFetch<TeamMember[]>(`/api/teams/${team.id}/members`),
        apiFetch<{ data?: UserOption[] } | UserOption[]>('/api/users?limit=500'),
      ])
      setMembersList(membersRes)
      const rawUsers = Array.isArray(usersRes) ? usersRes : ((usersRes as { data?: UserOption[] }).data ?? [])
      setUserOptions(
        (rawUsers as Array<{ id: string; full_name?: string; email?: string }>).map((u) => ({
          id: u.id,
          label: (u.full_name || u.email || u.id),
        }))
      )
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setMembersLoading(false)
    }
  }

  const handleAddMembers = async () => {
    if (!membersTeam || selectedUserIds.length === 0) return
    setAddingMembers(true)
    try {
      const res = await apiFetch<{ added: number; members: TeamMember[] }>(
        `/api/teams/${membersTeam.id}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: selectedUserIds }),
        }
      )
      setMembersList(res.members)
      setSelectedUserIds([])
      setTeams((prev) =>
        prev.map((t) =>
          t.id === membersTeam.id ? { ...t, member_count: res.members.length } : t
        )
      )
      message.success(`Added ${res.added} member(s)`)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to add members')
    } finally {
      setAddingMembers(false)
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    if (!membersTeam) return
    setRemovingId(member.id)
    try {
      await apiFetch(`/api/teams/${membersTeam.id}/members/${member.id}`, { method: 'DELETE' })
      const updated = membersList.filter((m) => m.id !== member.id)
      setMembersList(updated)
      setTeams((prev) =>
        prev.map((t) =>
          t.id === membersTeam.id ? { ...t, member_count: updated.length } : t
        )
      )
      message.success('Member removed')
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  const columns: ColumnsType<TeamRecord> = [
    {
      title: 'Team Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      defaultSortOrder: 'ascend',
      render: (name: string, record: TeamRecord) => (
        <Link href={`/settings/teams/${record.id}`} style={{ fontWeight: 600 }}>
          {name}
        </Link>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string | null) => {
        const label = formatTeamVisibilityLabel(type)
        if (label === '—') return <span>-</span>
        const slug = parseTeamVisibility(type)
        return slug ? (
          <Tag color={slug === 'private' ? 'purple' : 'blue'}>{label}</Tag>
        ) : (
          <Tag>{label}</Tag>
        )
      },
    },
    {
      title: 'Members',
      key: 'members',
      render: (_, record) => (
        <Space wrap size={4}>
          {(record.members ?? []).slice(0, 4).map((m) => (
            <Tooltip key={m.id} title={m.user_name}>
              <Avatar size="small" style={{ background: '#9155FD', fontSize: 11 }}>
                {(m.user_name ?? '?')[0].toUpperCase()}
              </Avatar>
            </Tooltip>
          ))}
          {(record.member_count ?? 0) > 4 && (
            <Avatar size="small" style={{ background: '#d9d9d9', color: '#555', fontSize: 11 }}>
              +{(record.member_count ?? 0) - 4}
            </Avatar>
          )}
          {(record.member_count ?? 0) === 0 && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: 'Created By',
      key: 'created_by',
      render: (_, record) => <span>{record.creator_name}</span>,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => <DateDisplay date={date} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="View team detail">
            <Link href={`/settings/teams/${record.id}`}>
              <Button type="default" icon={<EyeOutlined />} />
            </Link>
          </Tooltip>
          <Tooltip title="Manage Members">
            <Button icon={<UserAddOutlined />} onClick={() => openMembersModal(record)} />
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Edit team">
              <Button type="default" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            </Tooltip>
          )}
          {isAdmin && (
            <Popconfirm
              title="Delete Team"
              description="Are you sure you want to delete this team? All members will be removed."
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete">
                <Button type="primary" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const companyPlanColumns: ColumnsType<CompanyActivePlanRow> = [
    {
      title: 'No',
      dataIndex: 'no',
      key: 'no',
      width: 64,
      align: 'center',
    },
    {
      title: 'Company',
      dataIndex: 'company_label',
      key: 'company_label',
      ellipsis: true,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>
                Teams Management
              </Title>
              {isAdmin && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  Create Team
                </Button>
              )}
            </div>

            <Table
              columns={columns}
              dataSource={teams}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 15,
                showSizeChanger: true,
                pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                showTotal: appTableShowTotal('teams'),
              }}
            />
            <Divider />

            <Title level={4} style={{ marginTop: 40, marginBottom: 8 }}>
            Teams Condition
            </Title>
            
            {teamPlanGroups.length === 0 ? (
              <Text type="secondary">No companies with active teams — nothing to show in this section.</Text>
            ) : (
              <>
                {Array.from({ length: Math.ceil(teamPlanGroups.length / 2) }, (_, rowIdx) => {
                  const slice = teamPlanGroups.slice(rowIdx * 2, rowIdx * 2 + 2)
                  return (
                    <Row key={rowIdx} gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      {slice.map((g) => (
                        <Col xs={24} lg={slice.length === 1 ? 24 : 12} key={g.teamId}>
                          <div
                            style={{
                              border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                              borderRadius: 8,
                              overflow: 'hidden',
                              background: 'var(--ant-color-bg-container, #fff)',
                            }}
                          >
                            <div
                              style={{
                                background: g.headerColor,
                                padding: '10px 14px',
                                fontWeight: 600,
                                borderBottom: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                              }}
                            >
                              {g.teamName}
                            </div>
                            <Table<CompanyActivePlanRow>
                              columns={companyPlanColumns}
                              dataSource={g.rows}
                              rowKey="key"
                              loading={loading}
                              pagination={false}
                              size="small"
                              scroll={{ x: 480 }}
                            />
                          </div>
                        </Col>
                      ))}
                    </Row>
                  )
                })}
              </>
            )}
          </Card>

          {/* Create/Edit Team Modal */}
          <Modal
            title={editingTeam ? 'Edit Team' : 'Create Team'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={600}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="name"
                label="Team Name"
                rules={[{ required: true, message: 'Please enter team name!' }]}
              >
                <Input placeholder="Team Name" />
              </Form.Item>

              <Form.Item
                name="type"
                label="Type"
                rules={[{ required: true, message: 'Please choose Public or Private' }]}
              >
                <Select
                  placeholder="Select visibility"
                  options={[...TEAM_VISIBILITY_OPTIONS]}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    {editingTeam ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>

        </Content>
      </AdminMainColumn>

      {/* Manage Members Modal */}
      <Modal
        title={<Space><TeamOutlined />{membersTeam?.name} — Members</Space>}
        open={!!membersTeam}
        onCancel={() => setMembersTeam(null)}
        footer={null}
        width={560}
        destroyOnHidden
      >
        {membersLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Add members */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Add members</Text>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  mode="multiple"
                  placeholder="Select users to add…"
                  value={selectedUserIds}
                  onChange={setSelectedUserIds}
                  style={{ flex: 1 }}
                  showSearch
                  optionFilterProp="label"
                  options={userOptions
                    .filter((u) => !membersList.some((m) => m.user_id === u.id))
                    .map((u) => ({ value: u.id, label: u.label }))}
                />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  loading={addingMembers}
                  disabled={selectedUserIds.length === 0}
                  onClick={handleAddMembers}
                >
                  Add
                </Button>
              </Space.Compact>
            </div>

            {/* Current members list */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                Current members ({membersList.length})
              </Text>
              {membersList.length === 0 ? (
                <Text type="secondary">No members yet.</Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {membersList.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                      }}
                    >
                      <Space>
                        <Avatar size="small" style={{ background: '#9155FD', fontSize: 11 }}>
                          {(m.user_name ?? '?')[0].toUpperCase()}
                        </Avatar>
                        <div>
                          <Text strong style={{ fontSize: 13 }}>{m.user_name}</Text>
                          {m.user_email && (
                            <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{m.user_email}</Text>
                          )}
                        </div>
                        <Tag color="default" style={{ fontSize: 11 }}>{m.role}</Tag>
                      </Space>
                      <Popconfirm
                        title="Remove member?"
                        description={`Remove ${m.user_name} from this team?`}
                        onConfirm={() => handleRemoveMember(m)}
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                        cancelText="Cancel"
                      >
                        <Button
                          type="text"
                          danger
                          icon={<MinusCircleOutlined />}
                          loading={removingId === m.id}
                          size="small"
                        />
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
