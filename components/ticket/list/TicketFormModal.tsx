'use client'

import { DeleteOutlined,PaperClipOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Col,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useCallback,useId, useMemo } from 'react'

import SkillsSelect from '@/components/settings/SkillsSelect'
import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'
import { DEFAULT_RATE_CURRENCY, RATE_CURRENCIES } from '@/lib/billing-rate'

import type { Team, TicketRecord, UserRecord } from './types'
import type { NewTicketAttachment,TicketAttachment } from './types'

const { Option } = Select

interface TicketFormModalProps {
  open: boolean
  editingTicket: TicketRecord | null
  form: FormInstance
  teams: Team[]
  users: UserRecord[]
  ticketTypes: Array<{ id: number; title: string; color: string }>
  companies: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  allStatuses: Array<{ slug: string; title: string; is_active?: boolean }>
  selectedAssignees: string[]
  onSelectedAssigneesChange: (v: string[]) => void
  selectedTagIds: string[]
  onSelectedTagIdsChange: (v: string[]) => void
  ticketAttachmentsFromDb?: TicketAttachment[]
  newTicketAttachments?: NewTicketAttachment[]
  deletedTicketAttachmentIds?: string[]
  onDeletedAttachmentIdsChange?: (ids: string[] | ((prev: string[]) => string[])) => void
  onNewAttachmentsChange?: (attachments: NewTicketAttachment[] | ((prev: NewTicketAttachment[]) => NewTicketAttachment[])) => void
  onRemoveNewAttachment?: (attachment: NewTicketAttachment) => void
  onFilesSelected?: (files: File[] | FileList | null) => void
  attachmentUploading?: boolean
  submitting?: boolean
  onSubmit: (values: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  /** When true, show simplified form: Title, Description, Priority, Type only */
  isCustomer?: boolean
  /** Admin / manager: may set the ticket's price (per hour or fixed) when creating it */
  canEditBilling?: boolean
  /** Customer only: close the ticket from the edit modal */
  onCloseTicket?: (id: number) => void
  closingTicket?: boolean
}

export default function TicketFormModal({
  open,
  editingTicket,
  form,
  teams,
  users,
  ticketTypes,
  companies,
  allTags,
  allStatuses,
  selectedAssignees: _selectedAssignees,
  onSelectedAssigneesChange: _onSelectedAssigneesChange,
  selectedTagIds,
  onSelectedTagIdsChange,
  ticketAttachmentsFromDb = [],
  newTicketAttachments = [],
  deletedTicketAttachmentIds = [],
  onDeletedAttachmentIdsChange,
  onNewAttachmentsChange,
  onRemoveNewAttachment,
  onFilesSelected,
  attachmentUploading = false,
  submitting = false,
  onSubmit,
  onCancel,
  isCustomer = false,
  canEditBilling = false,
  onCloseTicket,
  closingTicket = false,
}: TicketFormModalProps) {
  /** Customers always use the same compact fields as create (title, description, type, priority). */
  const showSimplifiedForm = isCustomer
  /** Customer editing: hide description and attachments. Show only on create or for staff. */
  const showDescriptionField = !editingTicket || (!isCustomer)
  const showAttachmentSection = !editingTicket || (!isCustomer)
  const rawId = useId()
  const fileInputId = `ticket-files-${rawId.replace(/:/g, '')}`
  const watchedContactUserId = Form.useWatch('contact_user_id', form)
  const watchedCompanyId = Form.useWatch('company_id', form)
  const watchedPriceMode = Form.useWatch('price_mode', form) as 'default' | 'hourly' | 'fixed' | undefined
  const watchedCurrency = Form.useWatch('rate_currency', form) as string | undefined
  const customPrice = watchedPriceMode === 'hourly' || watchedPriceMode === 'fixed'
  const contactCompanyMismatchHint = useMemo(() => {
    if (showSimplifiedForm || !open) return null
    if (!watchedContactUserId || !watchedCompanyId) return null
    const u = users.find((x) => x.id === watchedContactUserId)
    const uc = u?.company_id
    if (!uc || uc === watchedCompanyId) return null
    const otherName = companies.find((c) => c.id === uc)?.name ?? 'another company'
    return `Contact belongs to a different company (${otherName}). When the ticket is created, its company will match the contact's company (cross-company).`
  }, [showSimplifiedForm, open, watchedContactUserId, watchedCompanyId, users, companies])

  const handleCancelWithGuard = useCallback(() => {
    // Only warn on create (not edit) when the user has typed something
    if (!editingTicket) {
      const values = form.getFieldsValue()
      const hasContent =
        (values.title && String(values.title).trim().length > 0) ||
        (values.description && String(values.description).replace(/<[^>]*>/g, '').trim().length > 0) ||
        newTicketAttachments.length > 0
      if (hasContent) {
        Modal.confirm({
          title: 'Discard draft?',
          content: 'You have unsaved changes. If you close now, your draft will be lost.',
          okText: 'Discard',
          okButtonProps: { danger: true },
          cancelText: 'Keep editing',
          centered: true,
          onOk: onCancel,
        })
        return
      }
    }
    onCancel()
  }, [editingTicket, form, newTicketAttachments, onCancel])

  const statusOptionsForForm = useMemo(() => {
    if (!editingTicket || showSimplifiedForm) return []
    const active = allStatuses.filter((s) => s.is_active !== false)
    const cur = editingTicket.status
    if (cur && !active.some((s) => s.slug === cur)) {
      const row = allStatuses.find((s) => s.slug === cur)
      return row ? [...active, row] : active
    }
    return active
  }, [allStatuses, editingTicket, showSimplifiedForm])

  return (
    <Modal
      title={editingTicket ? 'Edit Ticket' : 'Create Ticket'}
      open={open}
      onCancel={handleCancelWithGuard}
      footer={null}
      width={showSimplifiedForm ? 800 : 1200}
      centered
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: 'Please enter ticket title!' }]}
        >
          <Input placeholder="Ticket Title" />
        </Form.Item>

        {showDescriptionField && (
          <Form.Item name="description" label="Description">
            <CommentWysiwyg
              ticketId={editingTicket?.id}
              placeholder="Ticket Description"
              height="250px"
            />
          </Form.Item>
        )}

        {editingTicket && !showSimplifiedForm && (
          <Form.Item name="short_note" label="Short Note (Round Robin)">
            <Input.TextArea placeholder="Short note (optional)" rows={2} allowClear />
          </Form.Item>
        )}
        {showAttachmentSection && (
          <Form.Item label="Attachments">
            <Flex vertical style={{ width: '100%' }}>
              {ticketAttachmentsFromDb
                .filter((a) => !deletedTicketAttachmentIds.includes(a.id))
                .map((a) => (
                  <Space key={a.id} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PaperClipOutlined /> {a.file_name}
                    </a>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDeletedAttachmentIdsChange?.((prev) => [...prev, a.id])} />
                  </Space>
                ))}
              {newTicketAttachments.map((a, i) => (
                <Space key={`new-${i}`} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 5 }}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PaperClipOutlined /> {a.file_name}
                  </a>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => (onRemoveNewAttachment ? onRemoveNewAttachment(a) : onNewAttachmentsChange?.((prev) => prev.filter((_, idx) => idx !== i)))}
                  />
                </Space>
              ))}
              <input
                type="file"
                multiple
                style={{ display: 'none' }}
                id={fileInputId}
                onChange={(e) => {
                  const fileList = e.target.files
                  const filesArray = fileList ? Array.from(fileList) : []
                  e.target.value = ''
                  onFilesSelected?.(filesArray.length ? filesArray : null)
                }}
              />
              <Button
                icon={<PaperClipOutlined />}
                onClick={() => document.getElementById(fileInputId)?.click()}
                loading={attachmentUploading}
              >
                Attach files
              </Button>
            </Flex>
          </Form.Item>
        )}

        <Row gutter={24}>
          {editingTicket && !showSimplifiedForm ? (
            <Col span={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select>
                  {statusOptionsForForm.map((s) => (
                    <Option key={s.slug} value={s.slug}>
                      {s.title}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          ) : null}
          <Col span={showSimplifiedForm ? 12 : editingTicket ? 8 : 12}>
            <Form.Item name="type_id" label="Type">
              <Select placeholder="Select type" allowClear>
                {ticketTypes.map((t) => (
                  <Option key={t.id} value={t.id}>
                    <Space>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          backgroundColor: t.color,
                        }}
                      />
                      {t.title}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={showSimplifiedForm ? 12 : editingTicket ? 8 : 12}>
            <Form.Item
              name="priority"
              label="Priority"
              tooltip={
                showSimplifiedForm
                  ? '0 or empty appends the ticket to the back of the queue (the slot is assigned automatically—we do not store 0). Other numbers define order; within one company each support ticket has a distinct priority (1, 2, 3 …).'
                  : 'For support tickets per company: each priority number is unique (1 is first, and so on). 0 means append at the end of that company’s queue.'
              }
              rules={[{ required: true, message: 'Enter a priority number' }]}
            >
              <InputNumber min={0} precision={0} placeholder="0 = end of queue; 1, 2 …" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          {!showSimplifiedForm && (
            <>
              <Col span={12}>
                <Form.Item name="company_id" label="Company">
                  <Select placeholder="Select company" 
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={companies.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  >
                    {companies.map((c) => (
                      <Option key={c.id} value={c.id} label={c.name}>
                        {c.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Tags">
                  <Select
                    mode="multiple"
                    placeholder="Select tags"
                    value={selectedTagIds}
                    onChange={onSelectedTagIdsChange}
                    optionLabelProp="label"
                    allowClear
                  >
                    {allTags.map((t) => (
                      <Option key={t.id} value={t.id} label={t.name}>
                        {t.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </>
          )}
        </Row>

<Row gutter={24}>
  <Col span={12}>
        {!showSimplifiedForm && (
          <Form.Item
            name="contact_user_id"
            label="Contact (email replies)"
            tooltip="Optional. When set, customer replies from the portal go to this user; agent email replies use their address. Defaults to creator."
          >
            <Select
              placeholder="Same as creator (logged-in user)"
              allowClear
              showSearch
              optionFilterProp="label"
              options={users
                .filter((u) => String(u.email || '').trim() && (!watchedCompanyId || u.company_id === watchedCompanyId))
                .map((u) => ({
                  value: u.id,
                  label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
                }))}
            />
          </Form.Item>
        )}

        {!showSimplifiedForm && contactCompanyMismatchHint ? (
          <Alert type="warning" showIcon message={contactCompanyMismatchHint} style={{ marginBottom: 16 }} />
        ) : null}
        </Col>
        <Col span={12}>

        {!showSimplifiedForm && (
          <>
            <Form.Item
              name="team_id"
              label="Team"
              tooltip="Optional. Set when the ticket is tied to a team; newly created tickets are always public."
            >
              <Select placeholder="No team" allowClear showSearch optionFilterProp="label">
                {teams.map((t) => (
                  <Option key={t.id} value={t.id} label={t.name}>
                    {t.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>

           
          </>
        )}
        </Col>
        </Row>

        {!editingTicket && !showSimplifiedForm ? (
          <Form.Item
            name="required_skills"
            label="Skills needed"
            tooltip="Agents with these skills are suggested for the ticket. Leave empty to use the default skills of its type and tags."
            style={{ maxWidth: 560 }}
          >
            <SkillsSelect placeholder="e.g. WordPress, Billing" />
          </Form.Item>
        ) : null}

        {canEditBilling && !editingTicket && !showSimplifiedForm ? (
          <Form.Item label="Price" tooltip="Per hour: billable time × rate. Fixed: one price for the whole ticket, whatever the hours." style={{ maxWidth: 560 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="price_mode" noStyle initialValue="default">
                <Select
                  style={{ width: 190 }}
                  options={[
                    { value: 'default', label: 'Company default rate' },
                    { value: 'hourly', label: 'Per hour' },
                    { value: 'fixed', label: 'Fixed price' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="rate_currency" noStyle initialValue={DEFAULT_RATE_CURRENCY}>
                <Select style={{ width: 90 }} disabled={!customPrice} options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
              <Form.Item name="price_amount" noStyle rules={[{ required: customPrice, message: 'Enter the price' }]}>
                <InputNumber
                  min={0}
                  step={(watchedCurrency ?? DEFAULT_RATE_CURRENCY) === 'IDR' ? (watchedPriceMode === 'fixed' ? 100000 : 1000) : 1}
                  disabled={!customPrice}
                  placeholder={watchedPriceMode === 'fixed' ? 'whole ticket, any hours' : watchedPriceMode === 'hourly' ? 'per hour' : "uses the company's rate"}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
        ) : null}

        <Form.Item>
          <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingTicket ? 'Update' : 'Create'}
              </Button>
              <Button onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
            </Space>
            {isCustomer && editingTicket && onCloseTicket && (
              <Button
                danger
                loading={closingTicket}
                onClick={() => {
                  Modal.confirm({
                    title: 'Close this ticket?',
                    centered: true,
                    okText: 'Yes, close ticket',
                    content: 'When you close this ticket, you can still view it and leave another comment to reopen it.',
                    onOk: () => onCloseTicket(editingTicket.id),
                  })
                }}
              >
                Close this ticket
              </Button>
            )}
          </Flex>
        </Form.Item>
      </Form>
    </Modal>
  )
}
