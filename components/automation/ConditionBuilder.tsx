'use client'

import 'react-querybuilder/dist/query-builder.css'

import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { QueryBuilderAntD } from '@react-querybuilder/antd'
import { Button, Select } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { ActionProps, VersatileSelectorProps } from 'react-querybuilder'
import { type Field, QueryBuilder, type RuleGroupType, useValueSelector } from 'react-querybuilder'

import { defaultRQBQuery, type OurConditionGroup,ourFormatToRQB, rqbToOurFormat } from '@/lib/condition-builder-utils'

function AddRuleButton({ handleOnClick, label }: ActionProps) {
  return (
    <Button type="dashed" icon={<PlusOutlined />} block onClick={(e) => handleOnClick(e)}>
      {label ?? 'Add condition'}
    </Button>
  )
}

function RemoveRuleButton({ handleOnClick }: ActionProps) {
  return (
    <Button
      type="default"
      danger
      icon={<CloseOutlined />}
      onClick={(e) => handleOnClick(e)}
      size="small"
      style={{ width: 24, minWidth: 24, height: 24, padding: 0, flexShrink: 0 }}
    />
  )
}

// Custom value selector with search functionality
function SearchableValueSelector(props: VersatileSelectorProps) {
  const { onChange, val } = useValueSelector(props)

  return (
    <Select
      showSearch
      filterOption={(input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
      title={props.title}
      className={props.className}
      popupMatchSelectWidth={false}
      disabled={props.disabled}
      value={val}
      onChange={onChange}
      optionFilterProp="label"
      options={props.options}
    />
  )
}

/**
 * Static fields for ticket automation (Type options are loaded from `/api/tickets/lookup`).
 * Exported for tests; UI merges in Type after fetch.
 */
export const CONDITION_FIELDS: Field[] = [
  { name: 'subject', label: 'Subject (ticket title)' },
  { name: 'description', label: 'Description' },
  { name: 'priority', label: 'Priority (bilangan bulat)' },
  { name: 'status', label: 'Status', valueEditorType: 'select', values: [
    { name: 'pending', label: 'Pending' },
    { name: 'open', label: 'Open' },
    { name: 'in_progress', label: 'In Progress' },
    { name: 'resolved', label: 'Resolved' },
    { name: 'closed', label: 'Closed' },
  ]},
  { name: 'sender_domain', label: 'Sender Domain' },
  { name: 'sender_email', label: 'Sender Email' },
  // { name: 'assignee_id', label: 'Assignee ID' },
  { name: 'created_via', label: 'Created Via', valueEditorType: 'select', values: [
    { name: 'portal', label: 'Portal (Admin App)' },
    { name: 'email', label: 'Email' },
    { name: 'website', label: 'Website (Embed/Widget)' },
    { name: 'app', label: 'App (Mobile/External)' },
    { name: 'api', label: 'API' },
  ]},
  { name: 'ticket_type', label: 'Ticket classification (spam / trash)', valueEditorType: 'select', values: [
    { name: 'support', label: 'Support' },
    { name: 'spam', label: 'Spam' },
    { name: 'trash', label: 'Trash' },
  ]},
  { name: 'days_since_updated', label: 'Days since last updated', inputType: 'number', operators: [
    { name: '>', label: '>' },
    { name: '>=', label: '>=' },
    { name: '<', label: '<' },
    { name: '<=', label: '<=' },
  ]},
  { name: 'comment_author_type', label: 'Comment author', valueEditorType: 'select', values: [
    { name: 'agent', label: 'Agent / staff' },
    { name: 'customer', label: 'Customer' },
  ]},
]

interface ConditionBuilderProps {
  value?: OurConditionGroup | null
  /** Form.Item injects this; optional for type-check when used as `<ConditionBuilder />` only. */
  onChange?: (value: OurConditionGroup) => void
}

export default function ConditionBuilder({ value, onChange = () => {} }: ConditionBuilderProps) {
  const [statuses, setStatuses] = useState<{ name: string; label: string }[]>([])

  useEffect(() => {
    fetch('/api/tickets/lookup', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data?.statuses)) {
          setStatuses(data.statuses.map((s: { slug: string; title: string }) => ({ name: s.slug, label: s.title })))
        }
      })
      .catch(() => {})
  }, [])

  const fields: Field[] = CONDITION_FIELDS.map((f) =>
    f.name === 'status' && statuses.length > 0 ? { ...f, values: statuses } : f
  )

  const [query, setQuery] = useState<RuleGroupType>(() => {
    const v = value as OurConditionGroup | undefined
    return v?.conditions?.length
      ? (ourFormatToRQB(v) as RuleGroupType)
      : (defaultRQBQuery as RuleGroupType)
  })
  const isInternalChange = useRef(false)

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    const v = value as OurConditionGroup | undefined
    const next = v?.conditions?.length
      ? (ourFormatToRQB(v) as RuleGroupType)
      : (defaultRQBQuery as RuleGroupType)
    setQuery(next)
  }, [value])

  const handleChange = (q: RuleGroupType) => {
    isInternalChange.current = true
    setQuery(q)
    if (q.rules && q.rules.length > 0) {
      const our = rqbToOurFormat(q as Parameters<typeof rqbToOurFormat>[0])
      onChange(our)
    } else {
      onChange({ operator: 'AND', conditions: [] })
    }
  }

  return (
    <>
    <style>{`
      .condition-builder-action-style .ruleGroup {
        border: none !important;
        background: transparent !important;
        padding: 0 !important;
      }
      .condition-builder-action-style .ruleGroup-header {
        margin-bottom: 8px;
      }
      .condition-builder-action-style .ruleGroup-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .condition-builder-action-style .rule {
        display: flex;
        align-items: center;
        gap: 8px;
        border: none !important;
        background: transparent !important;
        padding: 0 !important;
      }
      .condition-builder-action-style .rule .rule-remove {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        min-width: 24px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      /* Shrink the operator dropdown so it doesn't crowd the X button */
      .condition-builder-action-style .rule .rule-operators {
        flex: 0 0 90px;
        min-width: 0;
        width: 90px !important;
      }
      .condition-builder-action-style .rule .rule-operators .ant-select {
        width: 90px !important;
      }
    `}</style>
    <div
      className="condition-builder-action-style"
      style={{
        padding: 16,
        background: 'var(--automation-builder-panel-bg)',
        borderRadius: 8,
        border: '1px solid var(--automation-builder-panel-border)',
      }}
    >
      <QueryBuilderAntD>
        <QueryBuilder
          fields={fields}
          query={query}
          onQueryChange={handleChange}
          addRuleToNewGroups
          showCombinatorsBetweenRules
          translations={{ addRule: { label: 'Add condition' } }}
          controlElements={{
            addGroupAction: () => null,
            addRuleAction: AddRuleButton,
            removeRuleAction: RemoveRuleButton,
            valueSelector: SearchableValueSelector,
          }}
        />
      </QueryBuilderAntD>
    </div>
    </>
  )
}
