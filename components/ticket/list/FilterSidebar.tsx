'use client'

import { BookOutlined, CloseOutlined, FilterOutlined } from '@ant-design/icons'
import { Badge, Button, DatePicker, Form, Input, message, Modal, Select, Space, Tooltip, Typography } from 'antd'
import { useState } from 'react'

/** Floating filter panel width (TicketsContent reserves FILTER_PANEL_WIDTH + 2 × 12px gap when open). */
export const FILTER_PANEL_WIDTH = 300
import type { Dayjs } from 'dayjs'

import { ticketStatusDisplayLabel } from '@/lib/ticket-status-kanban'

import type { StatusColumn } from './types'

const { Text } = Typography
const { Option } = Select

interface FilterSidebarProps {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  filterStatus: string[]
  onFilterStatusChange: (v: string[]) => void
  filterTypeIds: number[]
  onFilterTypeIdsChange: (v: number[]) => void
  filterCompanyIds: string[]
  onFilterCompanyIdsChange: (v: string[]) => void
  filterTagIds: string[]
  onFilterTagIdsChange: (v: string[]) => void
  filterTeamIds: string[]
  onFilterTeamIdsChange: (v: string[]) => void
  filterDateRange: [Dayjs | null, Dayjs | null] | null
  onFilterDateRangeChange: (dates: [Dayjs | null, Dayjs | null] | null) => void
  filterDueDateRange: [Dayjs | null, Dayjs | null] | null
  onFilterDueDateRangeChange: (dates: [Dayjs | null, Dayjs | null] | null) => void
  filterSearch: string
  onFilterSearchChange: (v: string) => void
  allStatuses: { slug: string; title: string; is_active?: boolean }[]
  ticketTypes: Array<{ id: number; title: string; color: string }>
  teams: Array<{ id: string; name: string }>
  companies: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  hasActiveFilters: boolean
  filteredCount: number
  totalCount: number
  onClearFilters: () => void
  /** When true, show only Status, Type, created/due date ranges, Search */
  isCustomer?: boolean
  /** Staff/admin: save current filters as a named shortcut (navbar). */
  onSaveViewPreset?: (name: string) => { ok: boolean; error?: string }
}

export default function FilterSidebar({
  collapsed,
  onCollapsedChange,
  filterStatus,
  onFilterStatusChange,
  filterTypeIds,
  onFilterTypeIdsChange,
  filterCompanyIds,
  onFilterCompanyIdsChange,
  filterTagIds,
  onFilterTagIdsChange,
  filterTeamIds,
  onFilterTeamIdsChange,
  filterDateRange,
  onFilterDateRangeChange,
  filterDueDateRange,
  onFilterDueDateRangeChange,
  filterSearch,
  onFilterSearchChange,
  allStatuses,
  ticketTypes,
  teams,
  companies,
  allTags,
  hasActiveFilters,
  filteredCount,
  totalCount,
  onClearFilters,
  isCustomer = false,
  onSaveViewPreset,
}: FilterSidebarProps) {
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [savePresetForm] = Form.useForm<{ name: string }>()

  // Closed: not rendered — the "Filters" button in the tickets header opens it.
  if (collapsed) return null

  return (
    <aside
      className="app-panel"
      aria-label="Ticket filters"
      style={{
        position: 'fixed',
        right: 12,
        top: 12,
        bottom: 12,
        width: FILTER_PANEL_WIDTH,
        zIndex: 150,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          height: 64,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 0 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
        }}
      >
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FilterOutlined />
          Filters
        </span>
        <Button
          type="text"
          icon={<CloseOutlined />}
          aria-label="Close filters"
          onClick={() => onCollapsedChange(true)}
          style={{ color: 'rgba(226, 232, 240, 0.85)', fontSize: 16 }}
        />
      </div>
      {!collapsed && (
        <div style={{ padding: 16 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Status</Text>
              <Select
                mode="multiple"
                placeholder="All statuses"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                value={filterStatus}
                onChange={(v) => onFilterStatusChange(v ?? [])}
                options={allStatuses.filter((s) => s.is_active !== false).map((s) => ({
                  value: s.slug,
                  label: ticketStatusDisplayLabel(s),
                }))}
                maxTagCount="responsive"
              />
            </div>
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Type</Text>
              <Select
                mode="multiple"
                placeholder="All types"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                value={filterTypeIds}
                onChange={(v) => onFilterTypeIdsChange(v ?? [])}
                maxTagCount="responsive"
              >
                {ticketTypes.map((t) => (
                  <Option key={t.id} value={t.id} label={t.title}>
                    <Space>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: t.color }} />
                      {t.title}
                    </Space>
                  </Option>
                ))}
              </Select>
            </div>
            {!isCustomer && (
              <>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Team</Text>
                  
                  <Select
                    mode="multiple"
                    placeholder="All teams"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    value={filterTeamIds}
                    onChange={(v) => onFilterTeamIdsChange(v ?? [])}
                    maxTagCount="responsive"
                  >
                    <Option key="__none__" value="__none__" label="No Team">— No Team</Option>
                    {teams.map((t) => (
                      <Option key={t.id} value={t.id} label={t.name}>{t.name}</Option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Company</Text>
                  <Select
                    mode="multiple"
                    placeholder="All companies"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    value={filterCompanyIds}
                    onChange={(v) => onFilterCompanyIdsChange(v ?? [])}
                    maxTagCount="responsive"
                  >
                    <Option key="__none__" value="__none__" label="No Company">— No Company</Option>
                    {companies.map((c) => (
                      <Option key={c.id} value={c.id} label={c.name}>{c.name}</Option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Tags</Text>
                  <Select
                    mode="multiple"
                    placeholder="All tags"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    value={filterTagIds}
                    onChange={(v) => onFilterTagIdsChange(v ?? [])}
                    optionLabelProp="label"
                    maxTagCount="responsive"
                  >
                  <Option key="__none__" value="__none__" label="No Tags">— No Tags</Option>
                    {allTags.map((t) => (
                      <Option key={t.id} value={t.id} label={t.name}>{t.name}</Option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Created date</Text>
              <DatePicker.RangePicker
                value={filterDateRange}
                onChange={(dates) => onFilterDateRangeChange(dates)}
                allowClear
                style={{ width: '100%' }}
                placeholder={['Start', 'End']}
              />
            </div>
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Due date</Text>
              <DatePicker.RangePicker
                value={filterDueDateRange}
                onChange={(dates) => onFilterDueDateRangeChange(dates)}
                allowClear
                style={{ width: '100%' }}
                placeholder={['Start', 'End']}
              />
            </div>
            {hasActiveFilters && (
              <>
                <Button type="link" size="small" onClick={onClearFilters} style={{ padding: 0, color: '#1890ff' }}>
                  Clear filters
                </Button>
                <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>
                  {filteredCount} of {totalCount} tickets
                </Text>
              </>
            )}
            {onSaveViewPreset && (
              <>
                
                <Button
                  type="primary"
                  icon={<BookOutlined />}
                  onClick={() => {
                    savePresetForm.resetFields()
                    setSavePresetOpen(true)
                  }}
                  style={{ width: '100%' }}
                >
                  Save filter to My Filters
                </Button>
              </>
            )}
          </Space>
        </div>
      )}
      {collapsed && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Tooltip title="Show filters">
            <Badge count={hasActiveFilters ? filteredCount : 0} size="small" overflowCount={999}>
              <Button
                type="text"
                icon={<FilterOutlined />}
                onClick={() => onCollapsedChange(false)}
                style={{ color: 'rgba(255,255,255,0.85)' }}
              />
            </Badge>
          </Tooltip>
        </div>
      )}
      <Modal
        title="Save view to navbar"
        open={savePresetOpen}
        onCancel={() => setSavePresetOpen(false)}
        okText="Save"
        onOk={() => savePresetForm.submit()}
      >
        <Form
          form={savePresetForm}
          layout="vertical"
          onFinish={(v) => {
            if (!onSaveViewPreset) return
            const r = onSaveViewPreset((v.name || '').trim())
            if (r.ok) {
              message.success('Saved next to search bar')
              setSavePresetOpen(false)
              savePresetForm.resetFields()
            } else {
              message.error(r.error || 'Could not save')
            }
          }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Enter a name' }]}
          >
            <Input placeholder="e.g. My team — this week" maxLength={80} autoFocus />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Opens /tickets with this filter set. Saved only on this browser for your account.
          </Text>
        </Form>
      </Modal>
    </aside>
  )
}
