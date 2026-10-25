'use client'

import { ClockCircleOutlined, DeleteOutlined,EditOutlined, PaperClipOutlined, SaveOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Col, Descriptions, Empty, Flex, InputNumber, Modal, Popconfirm, Row, Select, Space, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'

import CommentComposer from './CommentComposer'
import CommentHtml from './CommentHtml'
import CommentTaggedCcLines from './CommentTaggedCcLines'
import CommentWysiwyg from './CommentWysiwyg'
import TicketUserMention from './TicketUserMention'

const { Text, Paragraph } = Typography

function statusLabelForCustomer(slug: string | undefined | null, options: StatusOption[]): string {
  if (!slug) return '—'
  const s = options.find((o) => o.slug === slug)
  if (!s) return slug
  const ct = typeof s.customer_title === 'string' ? s.customer_title.trim() : ''
  return ct || s.title
}

function formatTicketNumericPriority(p: unknown): string {
  if (p === null || p === undefined || p === '') return '—'
  const n = typeof p === 'number' && Number.isFinite(p) ? p : Number((p ?? NaN) as number)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return String(Math.max(0, Math.floor(n)))
}

interface CommentAttachment {
  id: string
  file_url: string
  file_name: string
}

interface Comment {
  id: string
  ticket_id: number
  user_id: string
  comment: string
  created_at: string
  visibility?: 'note' | 'reply'
  author_type?: 'customer' | 'agent' | 'automation'
  user?: { id: string; full_name: string | null; email: string; avatar_url?: string | null }
  comment_attachments?: CommentAttachment[] | null
  tagged_user_ids?: string[]
  tagged_users?: { id: string; full_name: string | null; email: string }[]
  cc_emails?: string[]
  bcc_emails?: string[]
}

interface StatusOption {
  slug: string
  title: string
  /** Shown in customer portal instead of internal `title` when set */
  customer_title?: string
  color: string
}

interface TicketAttachment {
  id: string
  file_url: string
  file_name: string
  file_path?: string
}

interface TabGeneralCustomerProps {
  ticketData: any
  ticketAttachments?: TicketAttachment[]
  statusOptions: StatusOption[]
  onStatusChange?: (newStatus: string) => void | Promise<void>
  statusChanging?: boolean
  typeOptions: { id: number; title: string; slug: string; color: string }[]
  onSaveChanges?: (changes: { type_id?: number | null; priority?: number | null }) => Promise<void>
  savingChanges?: boolean
  comments: Comment[]
  currentUserId: string
  editingComment: string | null
  editingCommentValue: string
  onEditComment: (commentId: string, value: string) => void
  onEditingCommentValueChange: (v: string) => void
  onSaveEditComment: (commentId: string) => void
  onCancelEditComment: () => void
  onDeleteComment: (commentId: string) => void
  canDeleteComment: (createdAt: string) => boolean
  onRemoveCommentAttachment: (commentId: string, attachmentId: string) => void | Promise<void>
  removingCommentAttachmentKey?: string | null
  onAddComment: (
    commentText: string,
    attachments: { url: string; file_name: string; file_path: string }[],
    extra?: { taggedUserIds?: string[]; ccEmails?: string[]; bccEmails?: string[] }
  ) => Promise<void>
  addCommentLoading?: boolean
  commentsHasOlder?: boolean
  commentsOlderRemaining?: number
  onLoadMoreComments?: () => void | Promise<void>
  loadMoreCommentsLoading?: boolean
  companyCustomers?: Array<{ id: string; full_name: string | null; email: string }>
  /** Emails ever CC'd on this ticket - pre-fill CC on replies */
  ticketCcEmails?: string[]
  totalTimeSeconds: number
  activeTimeTracker: unknown
  formatTime: (seconds: number) => string
}

export default function TabGeneralCustomer({ ticketData, ticketAttachments = [], statusOptions, onStatusChange, statusChanging = false, typeOptions, onSaveChanges, savingChanges = false, comments, currentUserId, editingComment, editingCommentValue, onEditComment, onEditingCommentValueChange, onSaveEditComment, onCancelEditComment, onDeleteComment, canDeleteComment, onRemoveCommentAttachment, removingCommentAttachmentKey = null, onAddComment, addCommentLoading = false, commentsHasOlder = false, commentsOlderRemaining = 0, onLoadMoreComments, loadMoreCommentsLoading = false, companyCustomers = [], ticketCcEmails = [] }: TabGeneralCustomerProps) {
  const [typeDraft, setTypeDraft] = useState<number | null>(() => ticketData?.type_id ?? null)
  const [priorityDraft, setPriorityDraft] = useState<number | null>(() => {
    const raw = ticketData?.priority
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null
  })

  useEffect(() => {
    setTypeDraft(ticketData?.type_id ?? null)
  }, [ticketData?.type_id])

  useEffect(() => {
    const raw = ticketData?.priority
    setPriorityDraft(typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null)
  }, [ticketData?.priority])

  const isDirty =
    typeDraft !== (ticketData?.type_id ?? null) ||
    priorityDraft !== (ticketData?.priority ?? null)

  const creatorId = ticketData.creator?.id ?? ticketData.created_by ?? null
  const creatorEmail = ticketData.creator?.email ?? null
  const creatorLabel =
    ticketData.company?.name || ticketData.creator?.full_name || ticketData.creator?.email || 'Unknown'
  const closedStatusSlug =
    statusOptions.find((s) => s.slug === 'closed')?.slug ??
    statusOptions.find((s) => (s.title || '').trim().toLowerCase() === 'closed')?.slug ??
    null
  const canCloseTicket = Boolean(onStatusChange && closedStatusSlug && ticketData.status !== closedStatusSlug)
  const isTicketClosed = closedStatusSlug && ticketData.status === closedStatusSlug
  const openStatusSlug =
    statusOptions.find((s) => s.slug === 'open')?.slug ??
    statusOptions.find((s) => (s.title || '').trim().toLowerCase() === 'open')?.slug ??
    'open'
  const showReopenConfirm = () => {
    Modal.confirm({
      title: 'Reopen this ticket?',
      centered: true,
      okText: 'Yes, reopen ticket',
      content: 'This will move the ticket back to open status so our team can continue working on it.',
      onOk: () => onStatusChange?.(openStatusSlug),
    })
  }
  const showCloseTicketConfirm = () => {
    Modal.confirm({
      title: 'Close this ticket?',
      centered: true,
      width: 680,
      okText: 'Yes, close ticket',
      // cancelText: 'Cancel',
      content: (
        <div>
          When you close this ticket, you can still view it and leave another comment to reopen it.
          <br />
          While the ticket is in closed status, our team treats it as completed and cleared.
          <br />
          Thank you. We will be waiting for your next request.
        </div>
      ),
      onOk: () => closedStatusSlug && onStatusChange?.(closedStatusSlug),
    })
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={14}>
        <Flex
          gap="middle"
          align="flex-start"
          style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid var(--ticket-thread-divider)' }}
        >
          <TicketUserMention userId={creatorId} email={creatorEmail}>
            <Avatar style={{ cursor: creatorId ? 'pointer' : undefined }} icon={<UserOutlined />} src={ticketData.creator?.avatar_url} />
          </TicketUserMention>
          <Flex vertical style={{ flex: 1, minWidth: 0 }}>
            <Flex justify="space-between" align="center" wrap="wrap" gap="small">
              <Space>
                <TicketUserMention userId={creatorId} email={creatorEmail}>
                  <Text strong style={{ cursor: creatorId ? 'pointer' : undefined }}>
                    {creatorLabel}
                  </Text>
                </TicketUserMention>
                <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}>
                  <DateDisplay date={ticketData.created_at} format="relative" />
                </Text>
              </Space>
            </Flex>
            <CommentHtml html={ticketData.description || ''} />
            {ticketAttachments.length > 0 && (
              <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                {ticketAttachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'blue' }}
                  >
                    <PaperClipOutlined /> {att.file_name}
                  </a>
                ))}
              </Flex>
            )}
          </Flex>
        </Flex>

        {ticketData.contact?.id && ticketData.contact.id !== creatorId ? (
          <Text type="secondary" style={{ padding: '0 10px', display: 'block', marginBottom: 8 }}>
            Contact for replies:{' '}
            <TicketUserMention userId={ticketData.contact.id} email={ticketData.contact.email}>
              <Text strong>{ticketData.contact.full_name || ticketData.contact.email}</Text>
            </TicketUserMention>
            <Text type="secondary"> (Created by may differ)</Text>
          </Text>
        ) : null}

        <div style={{ padding: '0 16px', marginTop: 8, marginBottom: 4 }}>
          {commentsHasOlder ? (
            <Button
              type="link"
              loading={loadMoreCommentsLoading}
              onClick={() => onLoadMoreComments?.()}
              style={{ padding: 0 }}
            >
              Load older comments
              {commentsOlderRemaining > 0 ? ` (${commentsOlderRemaining} not shown yet)` : ''}
            </Button>
          ) : null}
        </div>

        <Flex orientation="vertical" style={{ width: '100%', padding: 16 }} gap={30}>
          {comments.length > 0 ? (
            <Flex vertical gap={10}>
              {comments.map((comment) => {
                const isAutomation = comment.author_type === 'automation'
                const isCustomer = comment.author_type === 'customer'
                const isCurrentUser = comment.user_id === currentUserId
                const borderColor = isAutomation
                  ? 'var(--ticket-thread-border-automation)'
                  : isCustomer
                    ? 'var(--ticket-thread-border-customer)'
                    : 'var(--ticket-thread-border-agent-reply)'
                const outline = 'var(--ticket-thread-bubble-outline)'
                const threadBubbleBorder = isCurrentUser
                  ? {
                      borderTop: `1px solid ${outline}`,
                      borderBottom: `1px solid ${outline}`,
                      borderLeft: `1px solid ${outline}`,
                      borderRight: '5px solid #52c41a',
                    }
                  : {
                      borderTop: `1px solid ${outline}`,
                      borderBottom: `1px solid ${outline}`,
                      borderRight: `1px solid ${outline}`,
                      borderLeft: `5px solid ${borderColor}`,
                    }
                const authorLabel = isAutomation
                  ? 'Automation'
                  : isCustomer
                    ? (ticketData.company?.name || 'Customer') + ' - ' + (comment.user?.full_name || comment.user?.email || 'Unknown')
                    : comment.user?.full_name || comment.user?.email || 'Unknown'
                const threadRole = isAutomation ? 'automation' : isCustomer ? 'customer' : 'agent-reply'
                const threadBgVar =
                  threadRole === 'automation'
                    ? 'var(--ticket-thread-bubble-automation)'
                    : threadRole === 'customer'
                      ? 'var(--ticket-thread-bubble-customer)'
                      : 'var(--ticket-thread-bubble-agent-reply)'
                return (
                  <div
                    key={comment.id}
                    className={`ticket-thread-bubble ticket-thread-bubble--${threadRole}`}
                    style={{
                      padding: 20,
                      borderRadius: 10,
                      color: 'var(--ticket-thread-text)',
                      backgroundColor: threadBgVar,
                      ...threadBubbleBorder,
                    }}
                  >
                  <Flex gap="middle" align="flex-start" style={{ width: '100%' }}>
                    {isAutomation ? (
                      <Avatar style={{ backgroundColor: '#0E7490' }} icon={<ThunderboltOutlined />} />
                    ) : (
                      <TicketUserMention userId={comment.user_id} email={comment.user?.email}>
                        <Avatar
                          style={{ cursor: comment.user_id ? 'pointer' : undefined }}
                          icon={<UserOutlined />}
                          src={comment.user?.avatar_url}
                        />
                      </TicketUserMention>
                    )}
                    <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                      <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                        <Space>
                          {isAutomation ? (
                            <Text strong style={{ color: 'var(--ticket-thread-text)' }}>
                              {authorLabel}
                            </Text>
                          ) : (
                            <TicketUserMention userId={comment.user_id} email={comment.user?.email}>
                              <Text
                                strong
                                style={{ cursor: comment.user_id ? 'pointer' : undefined, color: 'var(--ticket-thread-text)' }}
                              >
                                {authorLabel}
                              </Text>
                            </TicketUserMention>
                          )}
                          {/* <Tag color={isCustomer ? 'cyan' : 'gold'}>
                            {isCustomer ? 'Customer' : 'Agent'}
                          </Tag> */}
                          <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}>
                            <DateDisplay date={comment.created_at} format="relative" />
                          </Text>
                        </Space>
                        {!isAutomation && !isCustomer && comment.user_id === currentUserId && editingComment !== comment.id && (
                          <Space>
                            {canDeleteComment(comment.created_at) && (
                              <>
                                <Button
                                  icon={<EditOutlined />}
                                  size="middle"
                                  onClick={() => onEditComment(comment.id, comment.comment)}
                                />
                                <Popconfirm
                                  title="Delete comment"
                                  description="Are you sure?"
                                  onConfirm={() => onDeleteComment(comment.id)}
                                  okText="Yes"
                                  cancelText="No"
                                >
                                  <Button danger icon={<DeleteOutlined />} size="middle" />
                                </Popconfirm>
                              </>
                            )}
                          </Space>
                        )}
                      </Flex>
                      <CommentTaggedCcLines
                        tagged_users={comment.tagged_users}
                        tagged_user_ids={comment.tagged_user_ids}
                        cc_emails={comment.cc_emails}
                        bcc_emails={comment.bcc_emails}
                        resolveUser={(id) => {
                          const u = companyCustomers?.find((x) => x.id === id)
                          if (!u) return null
                          return { email: u.email, label: u.full_name || u.email }
                        }}
                      />
                      <Space orientation="vertical" size="small" style={{ width: '100%', marginTop: 4 }}>
                        {editingComment === comment.id ? (
                          <Flex vertical gap={40} style={{ width: '100%' }}>
                            <CommentWysiwyg
                              ticketId={ticketData?.id}
                              value={editingCommentValue}
                              onChange={onEditingCommentValueChange}
                              height="200px"
                            />
                            <Space>
                              <Button type="primary" onClick={() => onSaveEditComment(comment.id)}>
                                Save
                              </Button>
                              <Button onClick={onCancelEditComment}>Cancel</Button>
                            </Space>
                          </Flex>
                        ) : comment.comment && /<[a-z][\s\S]*>/i.test(comment.comment) ? (
                          <CommentHtml html={comment.comment} />
                        ) : (
                          <Paragraph style={{ margin: 0, color: 'var(--ticket-thread-text)' }}>{comment.comment}</Paragraph>
                        )}

                        {comment.comment_attachments?.length ? (
                          <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                            {comment.comment_attachments.map((att) => {
                              const attKey = att.id ? `${comment.id}:${att.id}` : ''
                              return (
                                <Flex key={att.id || att.file_url} align="center" gap={4} wrap="nowrap">
                                  <a
                                    href={att.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      color: '#1677ff',
                                      textDecoration: 'underline',
                                    }}
                                  >
                                    <PaperClipOutlined /> {att.file_name}
                                  </a>
                                  {editingComment === comment.id && att.id ? (
                                    <Popconfirm
                                      title="Remove this attachment?"
                                      okText="Remove"
                                      cancelText="Cancel"
                                      onConfirm={() => void onRemoveCommentAttachment(comment.id, att.id)}
                                    >
                                      <Button
                                        type="text"
                                        danger
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        aria-label="Remove attachment"
                                        loading={removingCommentAttachmentKey === attKey}
                                      />
                                    </Popconfirm>
                                  ) : null}
                                </Flex>
                              )
                            })}
                          </Flex>
                        ) : null}
                      </Space>
                    </Flex>
                  </Flex>
                  </div>
                )
              })}
            </Flex>
          ) : (
            <Empty description="No comments" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}

          <CommentComposer
            ticketId={ticketData?.id ?? 0}
            companyName={ticketData?.company?.name ?? 'unknown'}
            onAddComment={onAddComment}
            loading={addCommentLoading}
            commentVisibility="reply"
            showNoteOption={false}
            showReplyCcBcc={false}
          />
        </Flex>
      </Col>

      <Col xs={24} lg={10}>
        <Descriptions column={1} bordered>
          <Descriptions.Item label="Status">
            <Tag color={statusOptions.find((s) => s.slug === ticketData.status)?.color ?? 'default'}>
              {statusLabelForCustomer(ticketData.status, statusOptions)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Type">
            {onSaveChanges && !isTicketClosed ? (
              <Select
                value={typeDraft ?? undefined}
                onChange={(v) => setTypeDraft(v ?? null)}
                disabled={savingChanges}
                loading={typeDraft != null && typeOptions.length === 0}
                options={typeOptions.map((t) => ({
                  value: t.id,
                  label: <Tag color={t.color} style={{ margin: 0 }}>{t.title}</Tag>,
                }))}
                labelRender={(props) => {
                  const found = typeOptions.find((t) => t.id === (props.value as number))
                  if (!found) return <span style={{ color: '#999' }}>Loading…</span>
                  return <Tag color={found.color} style={{ margin: 0 }}>{found.title}</Tag>
                }}
                style={{ minWidth: 140, width: '100%' }}
                placeholder="Select type"
              />
            ) : (
              <Text>
                {ticketData.type_id
                  ? typeOptions.find((t) => t.id === ticketData.type_id)?.title ?? '—'
                  : '—'}
              </Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Priority">
            {onSaveChanges && !isTicketClosed ? (
              <InputNumber
                min={1}
                precision={0}
                value={priorityDraft ?? undefined}
                onChange={(v) =>
                  setPriorityDraft(
                    v == null || !Number.isFinite(Number(v))
                      ? null
                      : Math.max(1, Math.floor(Number(v)))
                  )
                }
                disabled={savingChanges}
                placeholder="Rank"
                style={{ width: '100%', minWidth: 120 }}
              />
            ) : (
              <Text>{formatTicketNumericPriority(ticketData.priority)}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Created By">
            <TicketUserMention userId={creatorId} email={creatorEmail}>
              <Space style={{ cursor: creatorId ? 'pointer' : undefined }}>
                <UserOutlined />
                <Text>{creatorLabel}</Text>
              </Space>
            </TicketUserMention>
          </Descriptions.Item>
          <Descriptions.Item label="CC Recipients">
            {ticketCcEmails?.length ? (
              <Text style={{ fontSize: 12 }}>{ticketCcEmails.join(', ')}</Text>
            ) : (
              <Text type="secondary">—</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Due Date">
            {ticketData.due_date ? (
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={ticketData.due_date} />
              </Space>
            ) : (
              <Text type="secondary">No due date</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Created At">
            <Space>
              <ClockCircleOutlined />
              <DateDisplay date={ticketData.created_at} />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Updated At">
            <Flex vertical gap={10} align="flex-start">
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={ticketData.updated_at} />
              </Space>
              
            </Flex>
          </Descriptions.Item>
          {/* <Descriptions.Item label="Total Time Tracked">
            <Space>
              <ClockCircleOutlined />
              <Text strong>{formatTime(totalTimeSeconds + (activeTimeTracker ? currentTime : 0))}</Text>
            </Space>
          </Descriptions.Item> */}
        </Descriptions>
        <br />
        {onSaveChanges && isDirty ? (
          <Button
            type="primary"
            icon={<SaveOutlined />}
            block
            loading={savingChanges}
            onClick={() => void onSaveChanges({ type_id: typeDraft, priority: priorityDraft })}
            style={{ marginBottom: canCloseTicket ? 8 : 0 }}
          >
            Save changes
          </Button>
        ) : null}
        {canCloseTicket ? (
          <Button type="primary" danger block loading={statusChanging} onClick={showCloseTicketConfirm}>
            Close this ticket
          </Button>
        ) : null}
        {isTicketClosed ? (
          <Button type="default" block loading={statusChanging} onClick={showReopenConfirm} style={{ marginTop: canCloseTicket ? 0 : 8 }}>
            Reopen Ticket
          </Button>
        ) : null}
      </Col>
      
    </Row>
  )
}
