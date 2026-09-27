'use client'

import { ArrowDownOutlined, ArrowUpOutlined, CheckSquareOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Collapse, Form, Input, Layout, message, Modal, Popconfirm, Select, Space, Tag, Typography } from 'antd'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

const { Content } = Layout
const { Text } = Typography

type TemplateGroup = { id: string; title: string; orderIndex: number }
type TemplateItem = { id: string; groupId: string | null; title: string; note: string | null; orderIndex: number }
type TemplateDetail = {
  id: string
  title: string
  description: string | null
  groups: TemplateGroup[]
  items: TemplateItem[]
}
type TemplateSummary = { id: string; title: string; description: string | null }

// Draft tracks local edits before saving
type DraftState = {
  groups: TemplateGroup[]
  items: TemplateItem[]
  deletedGroupIds: Set<string>
  deletedItemIds: Set<string>
  movedItems: Map<string, string | null>
  changedItems: Map<string, { title?: string; note?: string | null; order_index?: number }>
  dirty: boolean
}

function freshDraft(detail: TemplateDetail): DraftState {
  return {
    groups: [...detail.groups],
    items: [...detail.items],
    deletedGroupIds: new Set(),
    deletedItemIds: new Set(),
    movedItems: new Map(),
    changedItems: new Map(),
    dirty: false,
  }
}

function isNew(id: string) { return id.startsWith('__new__') }
let draftCounter = 0
function newId() { return `__new__${++draftCounter}` }

interface Props {
  user: { id?: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function ChecklistTemplatesContent({ user: currentUser }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDetail, setActiveDetail] = useState<TemplateDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [saving, setSaving] = useState(false)

  // Create template modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [createForm] = Form.useForm<{ title: string; description?: string }>()

  // Edit template name modal
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm] = Form.useForm<{ title: string; description?: string }>()

  // Add group inline
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // Add item
  const [itemOpen, setItemOpen] = useState(false)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemGroupId, setItemGroupId] = useState<string | null>(null)
  const [itemForm] = Form.useForm<{ title: string; note?: string }>()

  // Edit item
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemForm] = Form.useForm<{ title: string; note?: string }>()

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checklist-templates', { credentials: 'include' })
      const body = await res.json().catch(() => [])
      setTemplates(Array.isArray(body) ? body : [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/checklist-templates/${id}`, { credentials: 'include' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || 'Failed')
      const detail = body as TemplateDetail
      setActiveDetail(detail)
      setDraft(freshDraft(detail))
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load template')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  // Auto-select template from URL param after templates load
  useEffect(() => {
    if (loading) return
    const id = searchParams.get('id')
    if (id && !activeDetail) {
      void loadDetail(id)
    }
  }, [loading, searchParams, activeDetail, loadDetail])

  // ── Create template ──────────────────────────────────────────────
  const openCreate = () => {
    createForm.resetFields()
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    const v = await createForm.validateFields()
    setCreateSaving(true)
    try {
      const res = await fetch('/api/checklist-templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: v.title, description: v.description }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed')
      message.success('Template created')
      setCreateOpen(false)
      await loadTemplates()
      await loadDetail(body.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreateSaving(false)
    }
  }

  // ── Edit template name ───────────────────────────────────────────
  const openEdit = () => {
    if (!activeDetail) return
    editForm.setFieldsValue({ title: activeDetail.title, description: activeDetail.description ?? '' })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!activeDetail) return
    const v = await editForm.validateFields()
    setEditSaving(true)
    try {
      const res = await fetch(`/api/checklist-templates/${activeDetail.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: v.title, description: v.description }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed')
      message.success('Saved')
      setEditOpen(false)
      await loadTemplates()
      await loadDetail(activeDetail.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete template ──────────────────────────────────────────────
  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/checklist-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed')
      message.success('Deleted')
      setActiveDetail(null)
      setDraft(null)
      await loadTemplates()
    } catch {
      message.error('Failed to delete')
    }
  }

  // ── Draft mutations ──────────────────────────────────────────────
  const draftAddGroup = () => {
    const g = newGroupName.trim()
    if (!g || !draft) return
    setDraft((d) => d ? ({
      ...d,
      groups: [...d.groups, { id: newId(), title: g, orderIndex: d.groups.length }],
      dirty: true,
    }) : d)
    setNewGroupName('')
    setAddingGroup(false)
  }

  const draftDeleteGroup = (gid: string) => {
    if (!draft) return
    setDraft((d) => {
      if (!d) return d
      const nextGroups = d.groups.filter((g) => g.id !== gid)
      // Move items in this group to ungrouped
      const nextItems = d.items.map((i) =>
        i.groupId === gid ? { ...i, groupId: null } : i
      )
      const deletedGroupIds = new Set(d.deletedGroupIds)
      if (!isNew(gid)) deletedGroupIds.add(gid)
      return { ...d, groups: nextGroups, items: nextItems, deletedGroupIds, dirty: true }
    })
  }

  const openAddItem = (groupId: string | null) => {
    setItemGroupId(groupId)
    itemForm.resetFields()
    setItemOpen(true)
  }

  const draftAddItem = async () => {
    const v = await itemForm.validateFields()
    if (!draft) return
    setItemSaving(true)
    const itemsInGroup = draft.items.filter((i) => i.groupId === itemGroupId).length
    setDraft((d) => d ? ({
      ...d,
      items: [...d.items, {
        id: newId(),
        title: v.title.trim(),
        note: typeof v.note === 'string' && v.note.trim() ? v.note.trim() : null,
        groupId: itemGroupId,
        orderIndex: itemsInGroup,
      }],
      dirty: true,
    }) : d)
    setItemSaving(false)
    setItemOpen(false)
  }

  const draftDeleteItem = (iid: string) => {
    setDraft((d) => {
      if (!d) return d
      const nextItems = d.items.filter((i) => i.id !== iid)
      const deletedItemIds = new Set(d.deletedItemIds)
      if (!isNew(iid)) deletedItemIds.add(iid)
      return { ...d, items: nextItems, deletedItemIds, dirty: true }
    })
  }

  const draftMoveItem = (iid: string, groupId: string | null) => {
    setDraft((d) => {
      if (!d) return d
      const nextItems = d.items.map((i) => i.id === iid ? { ...i, groupId } : i)
      const movedItems = new Map(d.movedItems)
      if (!isNew(iid)) movedItems.set(iid, groupId)
      return { ...d, items: nextItems, movedItems, dirty: true }
    })
  }

  const openEditItem = (item: TemplateItem) => {
    setEditItemId(item.id)
    editItemForm.setFieldsValue({ title: item.title, note: item.note ?? '' })
  }

  const submitEditItem = async () => {
    const v = await editItemForm.validateFields()
    const title = v.title.trim()
    const note = typeof v.note === 'string' && v.note.trim() ? v.note.trim() : null
    setDraft((d) => {
      if (!d || !editItemId) return d
      const nextItems = d.items.map((i) =>
        i.id === editItemId ? { ...i, title, note } : i
      )
      const changedItems = new Map(d.changedItems)
      if (!isNew(editItemId)) {
        const prev = changedItems.get(editItemId) ?? {}
        changedItems.set(editItemId, { ...prev, title, note })
      }
      return { ...d, items: nextItems, changedItems, dirty: true }
    })
    setEditItemId(null)
  }

  const draftReorderItem = (iid: string, direction: 'up' | 'down') => {
    setDraft((d) => {
      if (!d) return d
      const item = d.items.find((i) => i.id === iid)
      if (!item) return d
      const siblings = d.items
        .filter((i) => i.groupId === item.groupId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
      const idx = siblings.findIndex((i) => i.id === iid)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= siblings.length) return d
      const swapItem = siblings[swapIdx]
      const newOrder = item.orderIndex
      const swapOrder = swapItem.orderIndex
      const changedItems = new Map(d.changedItems)
      if (!isNew(iid)) {
        const prev = changedItems.get(iid) ?? {}
        changedItems.set(iid, { ...prev, order_index: swapOrder })
      }
      if (!isNew(swapItem.id)) {
        const prev = changedItems.get(swapItem.id) ?? {}
        changedItems.set(swapItem.id, { ...prev, order_index: newOrder })
      }
      const nextItems = d.items.map((i) => {
        if (i.id === iid) return { ...i, orderIndex: swapOrder }
        if (i.id === swapItem.id) return { ...i, orderIndex: newOrder }
        return i
      })
      return { ...d, items: nextItems, changedItems, dirty: true }
    })
  }

  // ── Save all draft changes ───────────────────────────────────────
  const saveAll = async () => {
    if (!draft || !activeDetail) return
    setSaving(true)
    try {
      const tid = activeDetail.id

      // 1. Delete items first (before groups, to avoid FK issues)
      for (const iid of draft.deletedItemIds) {
        await fetch(`/api/checklist-templates/${tid}/items/${iid}`, {
          method: 'DELETE', credentials: 'include',
        })
      }

      // 2. Delete groups
      for (const gid of draft.deletedGroupIds) {
        await fetch(`/api/checklist-templates/${tid}/groups/${gid}`, {
          method: 'DELETE', credentials: 'include',
        })
      }

      // 3. Create new groups, collect tempId → realId map
      const groupIdMap = new Map<string, string>()
      for (const g of draft.groups) {
        if (!isNew(g.id)) continue
        const res = await fetch(`/api/checklist-templates/${tid}/groups`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: g.title, order_index: g.orderIndex }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok && body.id) groupIdMap.set(g.id, body.id)
      }

      // 4. Create new items (resolve temp groupIds)
      for (const item of draft.items) {
        if (!isNew(item.id)) continue
        const realGroupId = item.groupId
          ? (isNew(item.groupId) ? (groupIdMap.get(item.groupId) ?? null) : item.groupId)
          : null
        await fetch(`/api/checklist-templates/${tid}/items`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.title, note: item.note ?? null, group_id: realGroupId, order_index: item.orderIndex }),
        })
      }

      // 5. Move existing items to new groups
      for (const [iid, newGroupId] of draft.movedItems) {
        const realGroupId = newGroupId
          ? (isNew(newGroupId) ? (groupIdMap.get(newGroupId) ?? null) : newGroupId)
          : null
        await fetch(`/api/checklist-templates/${tid}/items/${iid}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: realGroupId }),
        })
      }

      // 6. PATCH edited / reordered items
      for (const [iid, changes] of draft.changedItems) {
        await fetch(`/api/checklist-templates/${tid}/items/${iid}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        })
      }

      message.success('Saved')
      await loadDetail(tid)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Discard draft ────────────────────────────────────────────────
  const discardDraft = () => {
    if (activeDetail) setDraft(freshDraft(activeDetail))
  }

  // ── Derived ──────────────────────────────────────────────────────
  const currentGroups = draft?.groups ?? activeDetail?.groups ?? []
  const currentItems = draft?.items ?? activeDetail?.items ?? []
  const ungroupedItems = currentItems.filter((i) => !i.groupId)
  const isDirty = draft?.dirty ?? false

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Checklist templates"
            description="Reusable checklists, organized in groups, that can be applied to tickets"
            count={`${templates.length} templates`}
            actions={
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                New template
              </Button>
            }
          />
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div className="tpl-layout">
              {/* Template list */}
              <nav className="ticket-surface tpl-list" aria-label="Checklist templates">
                <div className="tpl-list__head">Templates</div>
                {loading ? <div className="tpl-list__empty">Loading…</div> : null}
                {templates.length === 0 && !loading ? <div className="tpl-list__empty">No templates yet.</div> : null}
                {templates.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`tpl-list__item${activeDetail?.id === t.id ? ' is-active' : ''}`}
                    onClick={() => { router.replace(`?id=${t.id}`, { scroll: false }); void loadDetail(t.id) }}
                  >
                    <CheckSquareOutlined />
                    <span>{t.title}</span>
                  </button>
                ))}
              </nav>

              {/* Template detail */}
              {activeDetail ? (
                <Card
                  className="tpl-detail"
                  loading={detailLoading}
                  style={{ flex: 1, minWidth: 0 }}
                  styles={{ header: { padding: '12px 16px' }, body: { padding: 16 } }}
                  title={
                    <Space>
                      <Text strong>{activeDetail.title}</Text>
                      <Button icon={<EditOutlined />} type="text" onClick={openEdit} />
                      <Popconfirm
                        title="Delete this template?"
                        description="All groups and items will be removed."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void deleteTemplate(activeDetail.id)}
                      >
                        <Button icon={<DeleteOutlined />} type="text" danger />
                      </Popconfirm>
                    </Space>
                  }
                  extra={
                    <Space>
                      {isDirty && (
                        <>
                          <Button onClick={discardDraft}>Discard</Button>
                          <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={saving}
                            onClick={() => void saveAll()}
                          >
                            Save
                          </Button>
                        </>
                      )}
                      <Button icon={<PlusOutlined />} onClick={() => setAddingGroup((v) => !v)}>
                        Add Group
                      </Button>
                      <Button icon={<PlusOutlined />} type="primary" onClick={() => openAddItem(null)}>
                        Add Item
                      </Button>
                    </Space>
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {activeDetail.description && (
                      <Text type="secondary">{activeDetail.description}</Text>
                    )}

                    {/* Add group inline input */}
                    {addingGroup && (
                      <Space>
                        <Input
                          placeholder="Group name…"
                          value={newGroupName}
                          autoFocus
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onPressEnter={draftAddGroup}
                          onKeyDown={(e) => { if (e.key === 'Escape') setAddingGroup(false) }}
                          style={{ width: 260 }}
                        />
                        <Button type="primary" onClick={draftAddGroup} disabled={!newGroupName.trim()}>
                          Create
                        </Button>
                        <Button onClick={() => setAddingGroup(false)}>Cancel</Button>
                      </Space>
                    )}

                    {/* Groups */}
                    {currentGroups.length > 0 && (
                      <Collapse
                        key={currentGroups.map((g) => g.id).join(',')}
                        defaultActiveKey={currentGroups.map((g) => g.id)}
                        items={currentGroups.map((g) => ({
                          key: g.id,
                          label: (
                            <Space>
                              <Text strong>{g.title}</Text>
                              {isNew(g.id) && <Tag color="blue">new</Tag>}
                              <Tag>{currentItems.filter((i) => i.groupId === g.id).length} items</Tag>
                            </Space>
                          ),
                          extra: (
                            <Space onClick={(e) => e.stopPropagation()}>
                              <Button
                                icon={<PlusOutlined />}
                                onClick={() => openAddItem(g.id)}
                              >
                                Add item
                              </Button>
                              <Popconfirm
                                title="Delete group?"
                                description="Items in this group will become ungrouped."
                                okText="Delete"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => draftDeleteGroup(g.id)}
                              >
                                <Button danger icon={<DeleteOutlined />} type="text" />
                              </Popconfirm>
                            </Space>
                          ),
                          children: (
                            <Space direction="vertical" style={{ width: '100%' }} size={4}>
                              {(() => {
                                const groupItems = currentItems
                                  .filter((i) => i.groupId === g.id)
                                  .sort((a, b) => a.orderIndex - b.orderIndex)
                                return groupItems.map((item, idx) => (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '6px 8px',
                                      background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Space size={0} direction="vertical" style={{ flexShrink: 0 }}>
                                      <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => draftReorderItem(item.id, 'up')} style={{ padding: '0 4px', height: 18 }} />
                                      <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === groupItems.length - 1} onClick={() => draftReorderItem(item.id, 'down')} style={{ padding: '0 4px', height: 18 }} />
                                    </Space>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <Text>{item.title}</Text>
                                      {item.note && <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{item.note}</Text>}
                                    </div>
                                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditItem(item)} />
                                    <Select
                                      size="small"
                                      value={undefined}
                                      style={{ width: 160 }}
                                      placeholder="Move to…"
                                      onChange={(v: string) => draftMoveItem(item.id, v || null)}
                                      options={currentGroups
                                        .filter((grp) => grp.id !== g.id)
                                        .map((grp) => ({ value: grp.id, label: grp.title }))}
                                    />
                                    <Popconfirm
                                      title="Delete item?"
                                      okText="Delete"
                                      okButtonProps={{ danger: true }}
                                      onConfirm={() => draftDeleteItem(item.id)}
                                    >
                                      <Button type="text" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </div>
                                ))
                              })()}
                              {currentItems.filter((i) => i.groupId === g.id).length === 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  No items in this group yet.
                                </Text>
                              )}
                            </Space>
                          ),
                        }))}
                      />
                    )}

                    {/* Ungrouped items */}
                    {ungroupedItems.length > 0 && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                          Ungrouped items
                        </Text>
                        <Space direction="vertical" style={{ width: '100%' }} size={4}>
                          {ungroupedItems
                            .sort((a, b) => a.orderIndex - b.orderIndex)
                            .map((item, idx, arr) => (
                              <div
                                key={item.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 8px',
                                  background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
                                  borderRadius: 4,
                                }}
                              >
                                <Space size={0} direction="vertical" style={{ flexShrink: 0 }}>
                                  <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => draftReorderItem(item.id, 'up')} style={{ padding: '0 4px', height: 18 }} />
                                  <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === arr.length - 1} onClick={() => draftReorderItem(item.id, 'down')} style={{ padding: '0 4px', height: 18 }} />
                                </Space>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <Text>{item.title}</Text>
                                  {item.note && <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{item.note}</Text>}
                                </div>
                                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditItem(item)} />
                                {currentGroups.length > 0 && (
                                  <Select
                                    size="small"
                                    value={undefined}
                                    style={{ width: 160 }}
                                    placeholder="Move to group…"
                                    onChange={(v: string) => draftMoveItem(item.id, v)}
                                    options={currentGroups.map((g) => ({ value: g.id, label: g.title }))}
                                  />
                                )}
                                <Popconfirm
                                  title="Delete item?"
                                  okText="Delete"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => draftDeleteItem(item.id)}
                                >
                                  <Button type="text" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </div>
                            ))}
                        </Space>
                      </div>
                    )}

                    {currentGroups.length === 0 && ungroupedItems.length === 0 && !addingGroup && (
                      <Text type="secondary">No groups or items yet. Add a group or item above.</Text>
                    )}
                  </Space>
                </Card>
              ) : (
                <div className="tpl-empty">
                  <CheckSquareOutlined />
                  <div>Select a template on the left to view and edit its groups and items.</div>
                </div>
              )}
            </div>
          </Space>
        </Content>
      </AdminMainColumn>

      {/* Create template modal */}
      <Modal
        title="New Checklist Template"
        open={createOpen}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createSaving}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Template Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Onboarding Checklist" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit template modal */}
      <Modal
        title="Edit Template"
        open={editOpen}
        onOk={() => void submitEdit()}
        onCancel={() => setEditOpen(false)}
        confirmLoading={editSaving}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Template Name" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add item modal */}
      <Modal
        title={itemGroupId ? 'Add Item to Group' : 'Add Ungrouped Item'}
        open={itemOpen}
        onOk={() => void draftAddItem()}
        onCancel={() => setItemOpen(false)}
        confirmLoading={itemSaving}
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Item Title" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Notify stakeholders" autoFocus />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input.TextArea rows={2} placeholder="Pre-filled note when template is applied…" maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit item modal */}
      <Modal
        title="Edit Item"
        open={!!editItemId}
        onOk={() => void submitEditItem()}
        onCancel={() => setEditItemId(null)}
        destroyOnHidden
      >
        <Form form={editItemForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Item Title" rules={[{ required: true, message: 'Required' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input.TextArea rows={2} placeholder="Pre-filled note when template is applied…" maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
