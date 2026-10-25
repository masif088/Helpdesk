'use client'

import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  PlusOutlined,
  TagOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Collapse,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'
import type { ChecklistItemDto } from '@/lib/ticket-checklist-map'
import { linkifyPlainTextForHtml } from '@/lib/ticket-comment-utils'

const { Text } = Typography

function ChecklistNoteCell({
  item,
  onSave,
}: {
  item: ChecklistItemDto
  onSave: (itemId: string, note: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(item.completion_note ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(item.completion_note ?? '')
  }, [item.id, item.completion_note])

  const saveIfChanged = async () => {
    const next = draft.trim()
    const prev = (item.completion_note ?? '').trim()
    if (next === prev) return
    setSaving(true)
    try {
      await onSave(item.id, draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input.TextArea
      rows={2}
      value={draft}
      disabled={saving}
      placeholder="Add note here..."
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void saveIfChanged()}
      onPressEnter={(e) => {
        if (!e.shiftKey) {
          e.preventDefault()
          void saveIfChanged()
        }
      }}
      maxLength={2000}
      style={{ minWidth: 200 }}
    />
  )
}

export type TabChecklistProps = {
  ticketId: number
  checklistItems: ChecklistItemDto[]
  totalChecklistCount: number
  completedChecklistCount: number
  newChecklistTitle: string
  onNewChecklistTitleChange: (v: string) => void
  onAddChecklistItem: (groupName?: string | null) => void
  onCompleteChecklistItem: (itemId: string) => Promise<void>
  onUncompleteChecklistItem: (itemId: string) => Promise<void>
  onUpdateChecklistNote: (itemId: string, completionNote: string) => Promise<void>
  onDeleteChecklistItem: (itemId: string) => void
  onMoveToGroup?: (itemId: string, groupName: string | null) => Promise<void>
  onDeleteGroup?: (groupName: string) => Promise<void>
  onTemplateApplied?: () => void
}

type TemplateSummary = { id: string; title: string; description: string | null }

export default function TabChecklist({ ticketId, checklistItems, newChecklistTitle, onNewChecklistTitleChange, onAddChecklistItem, onCompleteChecklistItem, onUncompleteChecklistItem, onUpdateChecklistNote, onDeleteChecklistItem, onMoveToGroup, onDeleteGroup, onTemplateApplied }: TabChecklistProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()
  const [applying, setApplying] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [localGroups, setLocalGroups] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/checklist-templates', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => setTemplates([]))
  }, [])

  const applyTemplate = async () => {
    if (!selectedTemplateId) return
    setApplying(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/checklist/apply-template`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedTemplateId }),
      })
      if (!res.ok) throw new Error('Failed')
      setSelectedTemplateId(undefined)
      onTemplateApplied?.()
    } catch {
      // silent
    } finally {
      setApplying(false)
    }
  }

  const handleAddGroup = () => {
    const g = newGroupName.trim()
    if (!g) return
    setLocalGroups((prev) => (prev.includes(g) ? prev : [...prev, g]))
    setNewGroupName('')
    setAddingGroup(false)
  }

  // Drop localGroups that already have real items
  const activeLocalGroups = useMemo(() => {
    const realGroups = new Set(checklistItems.map((i) => i.group_name ?? ''))
    return localGroups.filter((g) => !realGroups.has(g))
  }, [localGroups, checklistItems])

  // ── Derived state ───────────────────────────────────────────────
  const groupOrder = useMemo(() => {
    const seen: string[] = []
    for (const item of checklistItems) {
      const g = item.group_name ?? ''
      if (!seen.includes(g)) seen.push(g)
    }
    for (const g of activeLocalGroups) {
      if (!seen.includes(g)) seen.push(g)
    }
    return seen
  }, [checklistItems, activeLocalGroups])

  const itemsByGroup = useMemo(() => {
    const map = new Map<string, ChecklistItemDto[]>()
    for (const item of checklistItems) {
      const g = item.group_name ?? ''
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(item)
    }
    return map
  }, [checklistItems])

  const hasGroups = groupOrder.some((g) => g !== '')
  const namedGroups = useMemo(() => groupOrder.filter((g) => g !== ''), [groupOrder])

  // ── Columns ─────────────────────────────────────────────────────
  const columns: ColumnsType<ChecklistItemDto> = useMemo(
    () => [
      {
        title: 'Done',
        key: 'done',
        width: 56,
        align: 'center',
        render: (_: unknown, item: ChecklistItemDto) => (
          <Checkbox
            checked={item.is_completed}
            onChange={() => {
              if (item.is_completed) {
                void onUncompleteChecklistItem(item.id)
              } else {
                void onCompleteChecklistItem(item.id)
              }
            }}
          />
        ),
      },
      {
        title: 'Task',
        dataIndex: 'title',
        key: 'title',
        render: (title: string, item: ChecklistItemDto) => (
          <div
            className="ql-editor comment-html"
            style={{
              margin: 0,
              padding: 0,
              minHeight: 'auto',
              fontSize: 14,
              textDecoration: item.is_completed ? 'line-through' : 'none',
              opacity: item.is_completed ? 0.75 : 1,
            }}
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHtml(linkifyPlainTextForHtml(title)),
            }}
          />
        ),
      },
      {
        title: 'Completed by',
        key: 'completed_by',
        width: 140,
        render: (_: unknown, item: ChecklistItemDto) =>
          item.is_completed && item.completed_by_name ? (
            <Text style={{ fontSize: 13 }}>{item.completed_by_name}</Text>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Completed at',
        key: 'completed_at',
        width: 160,
        render: (_: unknown, item: ChecklistItemDto) =>
          item.is_completed && item.completed_at ? (
            <DateDisplay date={item.completed_at} />
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Note',
        key: 'note',
        width: '32%',
        render: (_: unknown, item: ChecklistItemDto) => (
          <ChecklistNoteCell item={item} onSave={onUpdateChecklistNote} />
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        align: 'center',
        render: (_: unknown, item: ChecklistItemDto) => (
          <Popconfirm
            title="Delete checklist item"
            description="Are you sure?"
            onConfirm={() => onDeleteChecklistItem(item.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger type="text" icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ],
    [onCompleteChecklistItem, onUncompleteChecklistItem, onUpdateChecklistNote, onDeleteChecklistItem]
  )

  // Move-to column for a given current group (null = ungrouped)
  const makeMoveCol = (currentGroup: string | null): ColumnsType<ChecklistItemDto>[number] => ({
    title: 'Move to',
    key: 'move_to',
    width: 180,
    render: (_: unknown, item: ChecklistItemDto) => (
      <Select
        placeholder="Group…"
        style={{ width: '100%' }}
        value={undefined}
        options={[
          { value: '__ungrouped__', label: '— No Group' },
          ...namedGroups
            .filter((g) => g !== currentGroup)
            .map((g) => ({ value: g, label: g })),
        ]}
        onChange={(v: string) => {
          const target = v === '__ungrouped__' ? null : v
          void onMoveToGroup?.(item.id, target)
        }}
      />
    ),
  })

  // Columns for ungrouped table — adds "Move to group" select when named groups exist
  const ungroupedColumns: ColumnsType<ChecklistItemDto> = useMemo(() => {
    if (namedGroups.length === 0 || !onMoveToGroup || !editMode) return columns
    const moveCol = makeMoveCol(null)
    return [...columns.slice(0, -1), moveCol, columns[columns.length - 1]]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, namedGroups, onMoveToGroup, editMode])

  // Columns for a named group — adds "Move to" when in edit mode
  const makeGroupColumns = (groupName: string): ColumnsType<ChecklistItemDto> => {
    if (!editMode || !onMoveToGroup) return columns
    const moveCol = makeMoveCol(groupName)
    return [...columns.slice(0, -1), moveCol, columns[columns.length - 1]]
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%' }}>
      {/* Toolbar */}
      <Space style={{ marginBottom: 12 }} wrap>
        {templates.length > 0 && (
          <>
            <Select
              placeholder="Apply template…"
              style={{ minWidth: 180 }}
              value={selectedTemplateId}
              onChange={setSelectedTemplateId}
              options={templates.map((t) => ({ value: t.id, label: t.title }))}
              allowClear
            />
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              loading={applying}
              disabled={!selectedTemplateId}
              onClick={() => void applyTemplate()}
            >
              Apply
            </Button>
          </>
        )}
        <Button icon={<TagOutlined />} onClick={() => setAddingGroup((v) => !v)}>
          Add Group
        </Button>
        {hasGroups && (
          <Button
            icon={<EditOutlined />}
            type={editMode ? 'primary' : 'default'}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? 'Done' : 'Edit'}
          </Button>
        )}
      </Space>

      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* Add group inline input */}
        {addingGroup && (
          <Flex gap="small" align="center" style={{ maxWidth: 400 }}>
            <Input
              placeholder="Group name…"
              value={newGroupName}
              autoFocus
              onChange={(e) => setNewGroupName(e.target.value)}
              onPressEnter={handleAddGroup}
              onKeyDown={(e) => { if (e.key === 'Escape') setAddingGroup(false) }}
            />
            <Button type="primary" onClick={handleAddGroup} disabled={!newGroupName.trim()}>
              Create
            </Button>
            <Button onClick={() => setAddingGroup(false)}>Cancel</Button>
          </Flex>
        )}

        {checklistItems.length === 0 && !addingGroup && (
          <Empty description="No checklist items" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}

        {hasGroups ? (
          <>
            {/* Named groups — each as an accordion panel */}
            {namedGroups.length > 0 && (
              <Collapse
                defaultActiveKey={namedGroups}
                style={{ width: '100%' }}
                items={namedGroups.map((g) => {
                  const items = itemsByGroup.get(g) ?? []
                  const doneCount = items.filter((i) => i.is_completed).length
                  return {
                    key: g,
                    label: (
                      <Space>
                        <TagOutlined style={{ color: '#1677ff' }} />
                        <Text strong>{g}</Text>
                        <Tag color={doneCount === items.length && items.length > 0 ? 'success' : 'default'}>
                          {doneCount}/{items.length}
                        </Tag>
                      </Space>
                    ),
                    extra: onDeleteGroup && editMode ? (
                      <Popconfirm
                        title={`Delete group "${g}"?`}
                        description="All items in this group will become ungrouped."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void onDeleteGroup(g)}
                      >
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    ) : undefined,
                    children: (
                      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                        {items.length > 0 && (
                          <Table<ChecklistItemDto>
                            rowKey="id"
                            size="small"
                            pagination={false}
                            columns={makeGroupColumns(g)}
                            dataSource={items}
                            scroll={{ x: 900 }}
                          />
                        )}
                        <Flex gap="small" align="center" style={{ maxWidth: 680 }}>
                          <Input
                            placeholder={`Add item to "${g}"…`}
                            value={newChecklistTitle}
                            onChange={(e) => onNewChecklistTitleChange(e.target.value)}
                            onPressEnter={() => onAddChecklistItem(g)}
                            style={{ flex: 1 }}
                          />
                          <Button icon={<PlusOutlined />} onClick={() => onAddChecklistItem(g)}>
                            Add
                          </Button>
                        </Flex>
                      </Space>
                    ),
                  }
                })}
              />
            )}

            {/* Ungrouped items — also in accordion */}
            <Collapse
              defaultActiveKey={['__ungrouped__']}
              style={{ width: '100%' }}
              items={[{
                key: '__ungrouped__',
                label: (
                  <Space>
                    <Text strong>No Group</Text>
                    <Tag>{(itemsByGroup.get('') ?? []).length} items</Tag>
                  </Space>
                ),
                children: (
                  <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                    {(itemsByGroup.get('') ?? []).length > 0 && (
                      <Table<ChecklistItemDto>
                        rowKey="id"
                        size="small"
                        pagination={false}
                        columns={ungroupedColumns}
                        dataSource={itemsByGroup.get('') ?? []}
                        scroll={{ x: 900 }}
                      />
                    )}
                    <Flex gap="small" align="center" style={{ maxWidth: 680 }}>
                      <Input
                        placeholder="Add item (no group)…"
                        value={newChecklistTitle}
                        onChange={(e) => onNewChecklistTitleChange(e.target.value)}
                        onPressEnter={() => onAddChecklistItem(null)}
                        style={{ flex: 1 }}
                      />
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddChecklistItem(null)}>
                        Add
                      </Button>
                    </Flex>
                  </Space>
                ),
              }]}
            />
          </>
        ) : (
          /* No groups — flat list */
          <>
            {checklistItems.length > 0 && (
              <Table<ChecklistItemDto>
                rowKey="id"
                size="small"
                pagination={false}
                columns={columns}
                dataSource={checklistItems}
                scroll={{ x: 900 }}
              />
            )}
            <Flex gap="small" align="center" style={{ width: '100%', maxWidth: 720 }}>
              <Input
                placeholder="Add checklist item..."
                value={newChecklistTitle}
                onChange={(e) => onNewChecklistTitleChange(e.target.value)}
                onPressEnter={() => onAddChecklistItem(null)}
                style={{ flex: 1 }}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddChecklistItem(null)}>
                Add
              </Button>
            </Flex>
          </>
        )}
      </Space>
    </div>
  )
}
