'use client'

import { CloseOutlined,PlusOutlined } from '@ant-design/icons'
import { Button, Checkbox, Dropdown, Input, InputNumber, Select, Slider, Space } from 'antd'
import { useEffect, useState } from 'react'

import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'
import type { AutomationActions } from '@/lib/automation-actions-types'

type ActionType =
  | 'team_id'
  | 'company_id'
  | 'assignee_ids'
  | 'auto_assign_by_skill'
  | 'priority'
  | 'status_slug'
  | 'ticket_type'
  | 'tag_ids'
  | 'add_note'
  | 'add_checklist_items'

interface LookupData {
  companies: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  ticketTypes: { id: number; title: string; slug: string; color?: string }[]
  statuses: { id: number; title: string; slug: string; color?: string }[]
  tags: { id: string; name: string; slug: string; color?: string }[]
  users?: { id: string; full_name?: string; email?: string }[]
}

const TICKET_CLASSIFICATION_OPTIONS = [
  { value: 'support', label: 'Support' },
  { value: 'project', label: 'Project task' },
  { value: 'spam', label: 'Spam' },
  { value: 'trash', label: 'Trash' },
]

const ACTION_LABELS: Record<ActionType, string> = {
  team_id: 'Assign to Team',
  company_id: 'Set Company',
  assignee_ids: 'Assign to Agent(s)',
  auto_assign_by_skill: 'Auto-assign by skill match',
  priority: 'Set Priority (number)',
  status_slug: 'Set Status',
  ticket_type: 'Set classification (spam / trash)',
  tag_ids: 'Add Tags',
  add_note: 'Add Note',
  add_checklist_items: 'Add Checklist',
}

interface ActionBuilderProps {
  value?: AutomationActions | null
  onChange?: (value: AutomationActions) => void
}

async function fetchLookup() {
  const res = await fetch('/api/tickets/lookup', { credentials: 'include' })
  if (!res.ok) return null
  return res.json() as Promise<LookupData>
}

export default function ActionBuilder({ value, onChange = () => {} }: ActionBuilderProps) {
  const [lookup, setLookup] = useState<LookupData | null>(null)

  useEffect(() => {
    fetchLookup().then(setLookup)
  }, [])

  const actions = value && typeof value === 'object' ? value : {}

  const ORDERED_ACTION_KEYS: ActionType[] = [
    'team_id',
    'company_id',
    'assignee_ids',
    'auto_assign_by_skill',
    'priority',
    'status_slug',
    'ticket_type',
    'tag_ids',
    'add_note',
    'add_checklist_items',
  ]

  const shownKeys = ORDERED_ACTION_KEYS.filter(
    (k) => (actions as Record<string, unknown>)[k] !== undefined
  )

  const update = (key: keyof AutomationActions, val: unknown) => {
    const next = { ...actions }
    /** Quill fires onChange on mount with “empty” HTML; do not remove the Add Note row. */
    if (key === 'add_note') {
      if (val === undefined || val === null) {
        delete next.add_note
        delete next.add_note_user_id
      } else {
        ;(next as Record<string, unknown>).add_note = val
      }
      onChange(next as AutomationActions)
      return
    }
    if (key === 'priority' && (val === undefined || val === null)) {
      delete next.priority
    } else if (val === undefined || val === null || val === '') {
      delete next[key]
      if (key === 'add_checklist_items') delete next.add_checklist_items
    } else {
      ;(next as Record<string, unknown>)[key] = val
    }
    onChange(next as AutomationActions)
  }

  const addAction = (type: ActionType) => {
    const next = { ...actions }
    if (type === 'assignee_ids') {
      ;(next as Record<string, unknown>).assignee_ids = []
    } else if (type === 'auto_assign_by_skill') {
      ;(next as Record<string, unknown>).auto_assign_by_skill = { min_match: 100, only_if_unassigned: true, team_only: false }
    } else if (type === 'tag_ids') {
      ;(next as Record<string, unknown>).tag_ids = []
    } else if (type === 'add_note') {
      ;(next as Record<string, unknown>).add_note = ''
    } else if (type === 'add_checklist_items') {
      ;(next as Record<string, unknown>).add_checklist_items = []
    } else if (type === 'status_slug') {
      ;(next as Record<string, unknown>).status_slug = ''
    } else if (type === 'ticket_type') {
      ;(next as Record<string, unknown>).ticket_type = 'support'
    } else if (type === 'priority') {
      ;(next as Record<string, unknown>).priority = 0
    } else {
      ;(next as Record<string, unknown>)[type] = ''
    }
    onChange(next as AutomationActions)
  }

  const removeAction = (type: ActionType) => {
    const next = { ...actions }
    delete (next as Record<string, unknown>)[type]
    if (type === 'add_note') {
      delete (next as Record<string, unknown>).add_note_user_id
    }
    if (type === 'add_checklist_items') delete (next as Record<string, unknown>).add_checklist_items
    if (type === 'assignee_ids') delete (next as Record<string, unknown>).assignee_ids
    onChange(next as AutomationActions)
  }

  const availableToAdd = (
    [
      'team_id',
      'company_id',
      'assignee_ids',
      'auto_assign_by_skill',
      'priority',
      'status_slug',
      'ticket_type',
      'tag_ids',
      'add_note',
      'add_checklist_items',
    ] as ActionType[]
  ).filter((t) => !shownKeys.includes(t))

  if (!lookup) {
    return (
      <div className="automation-action-builder" style={{ padding: 16, color: 'var(--automation-builder-muted-text)' }}>
        Loading options…
      </div>
    )
  }

  return (
    <div
      className="automation-action-builder"
      style={{
        padding: 16,
        background: 'var(--automation-builder-panel-bg)',
        borderRadius: 8,
        border: '1px solid var(--automation-builder-panel-border)',
      }}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {/* Empty: only the "Add action" button, like the conditions builder */}
        {shownKeys.length === 0 ? null : (
          shownKeys.map((type) => (
            <div
              key={type}
              style={{
                padding: 12,
                background: 'var(--automation-builder-card-bg)',
                borderRadius: 6,
                border: '1px solid var(--automation-builder-card-border)',
              }}
            >
              {/* Header: title + close button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{ACTION_LABELS[type]}</span>
                <Button
                  type="default"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => removeAction(type)}
                  size="small"
                />
              </div>

              {/* Content: full width */}
              <div style={{ width: '100%' }}>
                {type === 'team_id' && (
                  <Select
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Select team"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).team_id}
                    onChange={(v) => update('team_id', v)}
                    options={lookup.teams.map((t) => ({ value: t.id, label: t.name }))}
                  />
                )}
                {type === 'company_id' && (
                  <Select
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Select company"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).company_id}
                    onChange={(v) => update('company_id', v)}
                    options={lookup.companies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
                {type === 'assignee_ids' && (
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Select agent(s)"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).assignee_ids as string[] | undefined}
                    onChange={(v) => update('assignee_ids', v?.length ? v : undefined)}
                    options={(lookup.users ?? [])
                      .filter((u) => u.id && (u as { role?: string }).role?.toLowerCase() !== 'customer')
                      .map((u) => ({ value: u.id, label: u.full_name || u.email || u.id }))}
                  />
                )}
                {type === 'auto_assign_by_skill' && (() => {
                  const cfg = (actions as AutomationActions).auto_assign_by_skill ?? { min_match: 100 }
                  const set = (patch: Partial<NonNullable<AutomationActions['auto_assign_by_skill']>>) =>
                    update('auto_assign_by_skill', { only_if_unassigned: true, team_only: false, ...cfg, ...patch })
                  return (
                    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 4 }}>
                          Assign when the agent has at least <strong>{cfg.min_match}%</strong> of the skills the ticket needs
                        </div>
                        <Space style={{ width: '100%' }} size={16} align="center">
                          <Slider min={10} max={100} step={5} value={cfg.min_match} onChange={(v) => set({ min_match: v })} style={{ width: 260 }} />
                          <InputNumber min={1} max={100} addonAfter="%" value={cfg.min_match} onChange={(v) => set({ min_match: v ?? 100 })} style={{ width: 100 }} />
                        </Space>
                        <div style={{ fontSize: 12, color: 'var(--ant-color-text-description)' }}>
                          100% = every needed skill. 50% with two skills needed = at least one. Among the agents who qualify, the best match wins, then the lightest plate.
                        </div>
                      </div>
                      <Checkbox checked={cfg.only_if_unassigned !== false} onChange={(e) => set({ only_if_unassigned: e.target.checked })}>
                        Only when nobody is assigned yet
                      </Checkbox>
                      <Checkbox checked={Boolean(cfg.team_only)} onChange={(e) => set({ team_only: e.target.checked })}>
                        Only members of the ticket&apos;s team (when it has one)
                      </Checkbox>
                      <div style={{ fontSize: 12, color: 'var(--ant-color-text-description)' }}>
                        Skills come from the ticket (Skills needed), else the defaults of its type and tags. Nothing is assigned when there are none, or nobody reaches the percentage. Put this after the actions that set the type, tags or team.
                      </div>
                    </Space>
                  )
                })()}
                {type === 'priority' && (
                  <InputNumber
                    min={0}
                    placeholder="Priority number"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).priority as number | undefined}
                    onChange={(v) => update('priority', v ?? undefined)}
                  />
                )}
                {type === 'status_slug' && (
                  <Select
                    showSearch
                    allowClear
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Select status"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).status_slug as string | undefined}
                    onChange={(v) => update('status_slug', v)}
                    options={lookup.statuses.map((s) => ({ value: s.slug, label: s.title }))}
                  />
                )}
                {type === 'ticket_type' && (
                  <Select
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Select classification"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).ticket_type}
                    onChange={(v) => update('ticket_type', v)}
                    options={TICKET_CLASSIFICATION_OPTIONS}
                  />
                )}
                {type === 'tag_ids' && (
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Select tags"
                    style={{ width: '100%' }}
                    value={(actions as Record<string, unknown>).tag_ids as string[] | undefined}
                    onChange={(v) => update('tag_ids', v?.length ? v : undefined)}
                    options={lookup.tags.map((t) => ({ value: t.id, label: t.name }))}
                  />
                )}
                {type === 'add_note' && (
                  <>
                    <CommentWysiwyg
                      placeholder="Enter note (rich text). Images upload to draft storage."
                      height="400px"
                      value={((actions as Record<string, unknown>).add_note as string | undefined) ?? ''}
                      onChange={(html) => update('add_note', html)}
                    />
                    <div style={{ fontSize: 12, color: 'var(--ant-color-text-description)', marginTop: 4 }}>
                      Notes are attributed to Automation (no user picker).
                    </div>
                  </>
                )}
                {type === 'add_checklist_items' && (
                  <Input.TextArea
                    placeholder={'One item per line (e.g.\nVerify customer info\nCheck payment\nSend confirmation)'}
                    rows={5}
                    style={{ width: '100%' }}
                    value={((actions as Record<string, unknown>).add_checklist_items as string[] | undefined)?.join('\n') ?? ''}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                      update('add_checklist_items', lines.length ? lines : undefined)
                    }}
                  />
                )}
              </div>
            </div>
          ))
        )}

        {availableToAdd.length > 0 && (
          <Dropdown
            menu={{
              items: availableToAdd.map((t) => ({
                key: t,
                label: ACTION_LABELS[t],
                onClick: () => addAction(t),
              })),
            }}
            trigger={['click']}
          >
            <Button type="dashed" icon={<PlusOutlined />} block>
              Add action
            </Button>
          </Dropdown>
        )}
      </Space>
    </div>
  )
}
