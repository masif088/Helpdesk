'use client'

import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  ForwardFilled,
  MessageOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ProfileOutlined,
  RobotOutlined,
  SendOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Grid,
  Input,
  InputNumber,
  Layout,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'

const { useBreakpoint } = Grid
import dayjs from 'dayjs'
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import DateDisplay from '@/components/common/DateDisplay'
import SkillsSelect from '@/components/settings/SkillsSelect'
import { DEFAULT_RATE_CURRENCY, RATE_CURRENCIES } from '@/lib/billing-rate'

import CommentAiSummaryTrigger from './CommentAiSummaryTrigger'
import CommentComposer from './CommentComposer'
import CommentHtml from './CommentHtml'
import CommentTaggedCcLines from './CommentTaggedCcLines'
import CommentWysiwyg from './CommentWysiwyg'
import CompanyTodayTotal from './CompanyTodayTotal'
import SuggestedAgents from './SuggestedAgents'
import TicketUserMention from './TicketUserMention'
import TrackerElapsed from './TrackerElapsed'

const { Text, Paragraph } = Typography

function OriginalDescriptionCollapse({ ticketData }: { ticketData: unknown }) {
  const [open, setOpen] = useState(false)
  const orig =
    ticketData && typeof ticketData === 'object' && 'original_description' in ticketData
      ? (ticketData as { original_description?: string | null }).original_description
      : null
  if (!orig) return null
  return (
    <div style={{ marginTop: 12 }}>
      <Button
        type="link"
        size="small"
        style={{ padding: 0, fontSize: 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide original email content' : 'View original email content'}
      </Button>
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 14px',
            borderLeft: '3px solid var(--ant-color-border)',
            background: 'var(--ant-color-bg-layout)',
            borderRadius: 4,
            opacity: 0.85,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            Original content (before edit)
          </Text>
          <CommentHtml html={orig} />
        </div>
      )}
    </div>
  )
}

function ticketSidebarPriorityValue(ticketData: unknown): number | null {
  const raw =
    ticketData && typeof ticketData === 'object' && 'priority' in ticketData
      ? (ticketData as { priority?: unknown }).priority
      : undefined
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

interface CommentAttachment { id: string; file_url: string; file_name: string }
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
  /** Made through an API key, e.g. "API · Claude (Acme)" */
  via?: string | null
  edited_by_user_id?: string | null
  edited_at?: string | null
  edited_by_user?: { id: string; full_name: string | null; email: string } | null
}

interface Attribute {
  id: string
  ticket_id: number
  meta_key: string
  meta_value: string | null
  created_at: string
  updated_at: string
}

interface StatusOption {
  slug: string
  title: string
  color: string
  /** false = inactive (hidden from this select except current ticket status) */
  is_active?: boolean
}

interface TicketAttachment { id: string; file_url: string; file_name: string; file_path?: string }

/** Sidebar ticket attributes — edited locally until Save attributes */
export interface SidebarAttributesDraft {
  status: string
  projectStatusId: number | null
  typeId: number | null
  /** Queue rank ≥1 within company support pool; null = unranked (e.g. closed). */
  priority: number | null
  companyId: string | null
  tagIds: string[]
  contactUserId: string | null
  dueDate: string | null
  teamId: string | null
  assigneeIds: string[]
  /** Local short note text; persisted with Save changes */
  shortNote: string
  /** Billing (only edited when canEditBilling): hourly rate, or one fixed price for the whole ticket */
  pricing: 'hourly' | 'fixed'
  hourlyRate: number | null
  fixedPrice: number | null
  rateCurrency: string | null
  /** Agent skills this ticket needs */
  requiredSkills: string[]
}

function snapshotSidebarDraft(params: {
  ticketData: any
  selectedTagIds: string[]
  selectedContactUserId: string | null
  selectedTeamId: string | null
  shortNoteProp: string | null | undefined
}): SidebarAttributesDraft {
  const {
    ticketData,
    selectedTagIds,
    selectedContactUserId,
    selectedTeamId,
    shortNoteProp,
  } = params
  const assigneeIds: string[] = Array.isArray(ticketData?.assignees)
    ? ticketData.assignees.map((a: { user_id?: string; user?: { id?: string } }) => a.user_id ?? a.user?.id ?? '').filter(Boolean)
    : []
  return {
    status: String(ticketData?.status ?? 'open'),
    projectStatusId: ticketData?.project_status_id ?? null,
    typeId: ticketData?.type_id ?? null,
    priority: ticketSidebarPriorityValue(ticketData),
    companyId: ticketData?.company_id ?? null,
    tagIds: [...selectedTagIds],
    contactUserId: selectedContactUserId ?? null,
    dueDate: ticketData?.due_date ? String(ticketData.due_date) : null,
    teamId: selectedTeamId ?? null,
    assigneeIds,
    shortNote: typeof shortNoteProp === 'string' ? shortNoteProp : '',
    pricing: typeof ticketData?.fixed_price === 'number' ? 'fixed' : 'hourly',
    hourlyRate: typeof ticketData?.hourly_rate === 'number' ? ticketData.hourly_rate : null,
    fixedPrice: typeof ticketData?.fixed_price === 'number' ? ticketData.fixed_price : null,
    rateCurrency: ticketData?.rate_currency ?? null,
    requiredSkills: Array.isArray(ticketData?.required_skills) ? ticketData.required_skills : [],
  }
}

function sidebarDraftEquals(a: SidebarAttributesDraft, b: SidebarAttributesDraft): boolean {
  const norm = (d: SidebarAttributesDraft) =>
    JSON.stringify({
      ...d,
      tagIds: [...d.tagIds].slice().sort(),
      assigneeIds: [...d.assigneeIds].slice().sort(),
    })
  return norm(a) === norm(b)
}

interface TabGeneralProps {
  ticketData: any
  ticketAttachments?: TicketAttachment[]
  statusOptions: StatusOption[]
  /** Board columns for `ticket_type === 'project'` */
  projectStatusOptions?: { id: number; title: string; slug: string; color: string }[]
  typeOptions: { id: number; title: string; slug: string; color: string }[]
  companyOptions: { id: string; name: string }[]
  /** Users who can be set as email reply contact; optional company_id for cross-company hints. */
  contactUserOptions?: Array<{
    id: string
    full_name: string | null
    email: string
    company_id?: string | null
    _type?: 'agent' | 'customer'
  }>
  selectedContactUserId?: string | null
  tagOptions: { id: string; name: string; slug: string }[]
  selectedTagIds: string[]
  /** When false, company and tags are read-only (customer view) */
  canEditCompanyAndTags?: boolean
  /** Admin / manager: show and edit the hourly billing rate */
  canEditBilling?: boolean
  teamOptions: { id: string; name: string }[]
  selectedTeamId: string | null
  canEditAssignees?: boolean
  /** Bump after batch-save succeeds so sidebar draft resets from props */
  sidebarBaselineTick: number
  sidebarAttributesSaving?: boolean
  onSaveSidebarAttributes: (draft: SidebarAttributesDraft) => Promise<void>
  totalTimeSeconds: number
  activeTimeTracker: any
  formatTime: (seconds: number) => string
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
    extra?: {
      taggedUserIds?: string[]
      ccEmails?: string[]
      bccEmails?: string[]
      summaryAsNote?: boolean
    }
  ) => Promise<void>
  onAddChecklistItemsBulk?: (titles: string[]) => Promise<void>
  onAddAiSummaryComment?: (html: string) => Promise<void>
  addCommentLoading?: boolean
  commentsHasOlder?: boolean
  commentsOlderRemaining?: number
  onLoadMoreComments?: () => void | Promise<void>
  loadMoreCommentsLoading?: boolean
  commentVisibility?: 'note' | 'reply' | null
  onCommentVisibilityChange?: (v: 'note' | 'reply') => void
  showNoteOption?: boolean
  nonCustomerUsers?: Array<{ id: string; full_name?: string | null; email: string }>
  companyCustomers?: Array<{ id: string; full_name: string | null; email: string }>
  /** Emails ever CC'd on this ticket - pre-fill CC on replies */
  ticketCcEmails?: string[]
  attributes: Attribute[]
  newAttributeKey: string
  newAttributeValue: string
  onNewAttributeKeyChange: (v: string) => void
  onNewAttributeValueChange: (v: string) => void
  onAddAttribute: () => void
  editingAttribute: string | null
  onEditingAttributeChange: (id: string | null) => void
  onUpdateAttribute: (attributeId: string, newValue: string) => void
  onDeleteAttribute: (attributeId: string) => void
  attributesLoading: boolean
  /** Agent: edit ticket description with explicit Save/Cancel */
  canEditTicketDescription?: boolean
  ticketDescriptionDraft?: string
  onTicketDescriptionDraftChange?: (html: string) => void
  ticketDescriptionEditing?: boolean
  onTicketDescriptionEditingStart?: () => void
  onTicketDescriptionEditingCancel?: () => void
  onTicketDescriptionSave?: () => void | Promise<void>
  ticketDescriptionSaving?: boolean
  onApplyAiSummaryToDescription?: (html: string) => Promise<void>
  currentUserRole?: string | null
  /** Hide AI summary buttons when AI is not configured in settings */
  aiConfigured?: boolean
  rightCollapsed?: boolean
  onRightCollapsedChange?: (v: boolean) => void
  /** Company Info panel closed (controlled from the ticket header toggle). */
  companyCollapsed?: boolean
  onCompanyCollapsedChange?: (v: boolean) => void
}

export default function TabGeneral({
  ticketData,
  ticketAttachments = [],
  statusOptions,
  projectStatusOptions,
  typeOptions,
  companyOptions,
  contactUserOptions = [],
  selectedContactUserId = null,
  tagOptions,
  selectedTagIds,
  canEditCompanyAndTags = true,
  canEditBilling = false,
  teamOptions,
  selectedTeamId,
  canEditAssignees = true,
  sidebarBaselineTick,
  sidebarAttributesSaving = false,
  onSaveSidebarAttributes,
  totalTimeSeconds,
  activeTimeTracker,
  formatTime,
  comments,
  currentUserId,
  editingComment,
  editingCommentValue,
  onEditComment,
  onEditingCommentValueChange,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  canDeleteComment,
  onRemoveCommentAttachment,
  removingCommentAttachmentKey = null,
  onAddComment,
  onAddChecklistItemsBulk,
  onAddAiSummaryComment,
  addCommentLoading = false,
  commentsHasOlder = false,
  commentsOlderRemaining = 0,
  onLoadMoreComments,
  loadMoreCommentsLoading = false,
  commentVisibility = null,
  onCommentVisibilityChange = () => {},
  showNoteOption = false,
  nonCustomerUsers = [],
  companyCustomers = [],
  ticketCcEmails = [],
  attributes,
  newAttributeKey,
  newAttributeValue,
  onNewAttributeKeyChange,
  onNewAttributeValueChange,
  onAddAttribute,
  editingAttribute,
  onEditingAttributeChange,
  onUpdateAttribute,
  onDeleteAttribute,
  attributesLoading,
  canEditTicketDescription = false,
  ticketDescriptionDraft = '',
  onTicketDescriptionDraftChange,
  ticketDescriptionEditing = false,
  onTicketDescriptionEditingStart,
  onTicketDescriptionEditingCancel,
  onTicketDescriptionSave,
  ticketDescriptionSaving = false,
  onApplyAiSummaryToDescription,
  currentUserRole,
  aiConfigured = false,
  rightCollapsed: rightCollapsedProp,
  onRightCollapsedChange,
  companyCollapsed: companyCollapsedProp,
  onCompanyCollapsedChange,
}: TabGeneralProps) {
  const canAccessTicketSummary = aiConfigured && ['admin', 'manager'].includes((currentUserRole ?? '').toLowerCase())
  const [rightCollapsedLocal, setRightCollapsedLocal] = useState(false)
  const rightCollapsed = rightCollapsedProp ?? rightCollapsedLocal
  const setRightCollapsed = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(rightCollapsed) : v
    setRightCollapsedLocal(next)
    onRightCollapsedChange?.(next)
  }
  const [companyCollapsedLocal, setCompanyCollapsedLocal] = useState(true)
  const companyCollapsed = companyCollapsedProp ?? companyCollapsedLocal
  const setCompanyCollapsed = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(companyCollapsed) : v
    setCompanyCollapsedLocal(next)
    onCompanyCollapsedChange?.(next)
  }
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [drawerAttrOpen, setDrawerAttrOpen] = useState(false)
  const [drawerCompanyOpen, setDrawerCompanyOpen] = useState(false)
  /** Closed panels are not rendered; open ones float with the sidebar's 12px gap. */
  const ATTR_W = rightCollapsed ? 0 : 280
  const COMP_W = companyCollapsed ? 0 : 220
  const PANEL_GAP = 12
  const openPanels = (ATTR_W ? 1 : 0) + (COMP_W ? 1 : 0)

  useEffect(() => {
    const width = isMobile || openPanels === 0 ? 0 : ATTR_W + COMP_W + PANEL_GAP * openPanels
    document.documentElement.style.setProperty('--attr-sidebar-width', `${width}px`)
    return () => { document.documentElement.style.removeProperty('--attr-sidebar-width') }
  }, [ATTR_W, COMP_W, isMobile, openPanels])

  const [sidebarDraft, setSidebarDraft] = useState<SidebarAttributesDraft>(() =>
    snapshotSidebarDraft({
      ticketData,
      selectedTagIds,
      selectedContactUserId,
      selectedTeamId,
      shortNoteProp: ticketData?.short_note ?? null,
    }),
  )
  const [sidebarBaseline, setSidebarBaseline] = useState<SidebarAttributesDraft>(() =>
    snapshotSidebarDraft({
      ticketData,
      selectedTagIds,
      selectedContactUserId,
      selectedTeamId,
      shortNoteProp: ticketData?.short_note ?? null,
    }),
  )

  useEffect(() => {
    const s = snapshotSidebarDraft({
      ticketData,
      selectedTagIds,
      selectedContactUserId,
      selectedTeamId,
      shortNoteProp: ticketData?.short_note ?? null,
    })
    setSidebarBaseline(s)
    setSidebarDraft(s)
  }, [ticketData?.id, ticketData?.priority, ticketData?.short_note, ticketData?.company_id, sidebarBaselineTick])

  const sidebarDirty = useMemo(
    () => !sidebarDraftEquals(sidebarDraft, sidebarBaseline),
    [sidebarDraft, sidebarBaseline],
  )

  type CompanyAttr = { id: string; meta_key: string; meta_value: string | null }
  type TopTicket = { id: number; title: string; status: string; priority: number | null }

  const [companyDetail, setCompanyDetail] = useState<{
    name: string; email?: string | null; active_manager_id?: string | null
    active_team_id?: string | null; domainList?: string[]
  } | null>(null)
  const [companyAttrs, setCompanyAttrs] = useState<CompanyAttr[]>([])
  const [topTickets, setTopTickets] = useState<TopTicket[]>([])
  const [companyTodaySeconds, setCompanyTodaySeconds] = useState<number | null>(null)
  const [companyHasActiveTracker, setCompanyHasActiveTracker] = useState(false)
  const [companyActiveTrackerUser, setCompanyActiveTrackerUser] = useState<string | null>(null)
  const [companyActiveTrackerStart, setCompanyActiveTrackerStart] = useState<string | null>(null)
  const [companyMissing, setCompanyMissing] = useState(false)
  const [companyActiveTrackers, setCompanyActiveTrackers] = useState<{ user_name: string | null; start_time: string; ticket_id?: number | null; ticket_title?: string | null }[]>([])

  useEffect(() => {
    const cid = ticketData?.company_id
    if (!cid || companyCollapsed) return
    setCompanyMissing(false)
    fetch(`/api/companies/${cid}`, { credentials: 'include' })
      .then(r => {
        if (r.status === 404) setCompanyMissing(true)
        return r.ok ? r.json() : null
      })
      .then(j => { if (j?.data) setCompanyDetail(j.data) })
      .catch(() => {})
    fetch(`/api/companies/${cid}/attributes`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setCompanyAttrs(j.data) })
      .catch(() => {})
    fetch(`/api/companies/${cid}/tickets?limit=5&exclude=client_review,closed,pending`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setTopTickets(j.data) })
      .catch(() => {})
    fetch(`/api/tickets/company-time-stats?company_ids=${cid}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (Array.isArray(j) && j[0]) {
          setCompanyTodaySeconds(j[0].today_seconds)
          setCompanyHasActiveTracker(j[0].has_active_tracker ?? false)
          setCompanyActiveTrackerUser(j[0].active_tracker_user_name ?? null)
          setCompanyActiveTrackerStart(j[0].active_tracker_start_time ?? null)
          setCompanyActiveTrackers(j[0].active_trackers ?? [])
        }
      })
      .catch(() => {})
  }, [ticketData?.company_id, companyCollapsed])


  const statusSelectOptions = useMemo(() => {
    const cur = sidebarDraft.status as string | undefined
    const active = statusOptions.filter((s) => s.is_active !== false)
    if (cur && !active.some((s) => s.slug === cur)) {
      const row = statusOptions.find((s) => s.slug === cur)
      return row ? [...active, row] : active
    }
    return active
  }, [statusOptions, sidebarDraft.status])

  const useProjectBoardStatus =
    ticketData?.ticket_type === 'project' &&
    Array.isArray(projectStatusOptions) &&
    projectStatusOptions.length > 0

  const contactCrossCompanyHint = useMemo(() => {
    if (!sidebarDraft.contactUserId || !ticketData.company_id) return null
    const row = contactUserOptions.find((o) => o.id === sidebarDraft.contactUserId)
    const uid = row?.company_id
    if (!uid || uid === ticketData.company_id) return null
    const otherName = companyOptions.find((c) => c.id === uid)?.name ?? 'another company'
    return `Contact is from ${otherName}. After saving, the ticket's company will match the contact's company (cross-company).`
  }, [sidebarDraft.contactUserId, ticketData.company_id, contactUserOptions, companyOptions])

  const creatorId = ticketData.creator?.id ?? ticketData.created_by ?? null
  const creatorEmail = ticketData.creator?.email ?? null
  const isAutomationCreated = ticketData.created_via === 'recurring' || ticketData.created_via === 'automation'
  const automationLabel = ticketData.created_via === 'recurring' ? 'Recurring Ticket' : 'Automation'
  /** Thread header: company + person when both exist (portal context). */
  const creatorLabel = isAutomationCreated
    ? [ticketData.company?.name, automationLabel].filter(Boolean).join(' · ') || automationLabel
    : [ticketData.company?.name, ticketData.creator?.full_name || ticketData.creator?.email].filter(Boolean).join(' · ') ||
      ticketData.creator?.full_name ||
      ticketData.creator?.email ||
      ticketData.company?.name ||
      'Unknown'
  /** Sidebar "Created By": person under company ticket only (company has its own row). */
  const createdByPersonLabel = isAutomationCreated
    ? automationLabel
    : ticketData.creator?.full_name || ticketData.creator?.email || '—'

  const creatorInitial = (ticketData.creator?.full_name || ticketData.creator?.email || '').trim().charAt(0).toUpperCase()

  const LBL: React.CSSProperties = { fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }
  const VAL: React.CSSProperties = { color: 'rgba(255,255,255,0.85)' }
  const isUrl = (v: string) => { try { const u = new URL(v.trim()); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false } }
  const shortenUrl = (v: string) => { try { const u = new URL(v.trim()); const host = u.hostname.replace(/^www\./, ''); const path = u.pathname.replace(/\/$/, ''); return path && path !== '/' ? `${host}${path.length > 28 ? path.slice(0, 28) + '…' : path}` : host } catch { return v } }

  return (
    <>
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[24, 24]} align="top">
      <Col xs={24}>


      <Flex vertical gap={10} style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid var(--ticket-thread-divider)' }}>
                      <Flex justify="space-between" align="flex-start" wrap="wrap" gap="small">
                          <Flex align="center" gap={8} style={{ minWidth: 0, flex: 1 }}>
                            {(ticketData.created_via === 'recurring' || ticketData.created_via === 'automation') ? (
                              <Avatar
                                size="small"
                                style={{ backgroundColor: '#0E7490', flexShrink: 0 }}
                                icon={ticketData.created_via === 'recurring' ? <SyncOutlined /> : <RobotOutlined />}
                              />
                            ) : (
                              <TicketUserMention userId={creatorId} email={creatorEmail}>
                                <Avatar
                                  size="small"
                                  style={{ cursor: creatorId ? 'pointer' : undefined, flexShrink: 0, ...(!ticketData.creator?.avatar_url && creatorInitial ? { background: 'var(--brand-primary)' } : {}) }}
                                  icon={creatorInitial ? undefined : <UserOutlined />}
                                  src={ticketData.creator?.avatar_url}
                                >
                                  {creatorInitial}
                                </Avatar>
                              </TicketUserMention>
                            )}
                            <Flex vertical gap={2} style={{ minWidth: 0 }}>
                              {ticketData.company_id ? (
                                <Text strong>
                                  {ticketData.company?.name ||
                                    companyOptions.find((c) => c.id === ticketData.company_id)?.name ||
                                    '—'}
                                </Text>
                              ) : !isAutomationCreated && createdByPersonLabel !== '—' ? (
                                // No company: the requester is the headline instead
                                <TicketUserMention userId={creatorId} email={creatorEmail}>
                                  <Text strong style={{ cursor: creatorId ? 'pointer' : undefined }}>
                                    {createdByPersonLabel}
                                  </Text>
                                </TicketUserMention>
                              ) : null}
                              <Text
                                type="secondary"
                                style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}
                              >
                                Created By{' '}
                                {isAutomationCreated ? (
                                  <Text style={{ color: '#0E7490', fontWeight: 500 }}>{createdByPersonLabel}</Text>
                                ) : (
                                  <TicketUserMention userId={creatorId} email={creatorEmail} className="ml-1">
                                    <Text
                                      style={{ cursor: creatorId ? 'pointer' : undefined, color: 'var(--ticket-thread-text)' }}
                                    >
                                      {createdByPersonLabel}
                                    </Text>
                                  </TicketUserMention>
                                )}
                                <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)', marginLeft: 4 }}>
                                  Created At: <DateDisplay date={ticketData.created_at} format="relative" />
                                </Text>
                              </Text>
                            </Flex>
                          </Flex>
                          {ticketData?.id && !ticketDescriptionEditing && (onApplyAiSummaryToDescription || (canAccessTicketSummary && onAddAiSummaryComment) || canEditTicketDescription) ? (
                            <Flex gap={6} align="center" style={{ flexShrink: 0 }}>
                              {aiConfigured && onApplyAiSummaryToDescription ? (
                                <CommentAiSummaryTrigger
                                  ticketId={ticketData.id}
                                  summarizeAnchor={{ type: 'description' }}
                                  disabled={ticketDescriptionSaving}
                                  onApplyToDescription={onApplyAiSummaryToDescription}
                                  tooltip="Summarize description (AI)"
                                />
                              ) : null}
                              {canAccessTicketSummary && showNoteOption && onAddAiSummaryComment ? (
                                <CommentAiSummaryTrigger
                                  ticketId={ticketData.id}
                                  summarizeAnchor={{ type: 'ticket' }}
                                  addCommentLoading={addCommentLoading}
                                  disabled={addCommentLoading || ticketDescriptionSaving}
                                  onAddComment={onAddAiSummaryComment}
                                  onAddChecklistItems={onAddChecklistItemsBulk}
                                  tooltip="Summarize full ticket — last 100 messages (Admin/Manager)"
                                  variant="ticket"
                                />
                              ) : null}
                              {canEditTicketDescription ? (
                                <Button
                                  type="primary"
                                  icon={<EditOutlined />}
                                  onClick={onTicketDescriptionEditingStart}
                                  aria-label="Edit description"
                                />
                              ) : null}
                            </Flex>
                          ) : null}
                        </Flex>
                        {ticketDescriptionEditing && canEditTicketDescription ? (
                          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                            <CommentWysiwyg
                              value={ticketDescriptionDraft}
                              onChange={onTicketDescriptionDraftChange}
                              ticketId={ticketData?.id}
                              placeholder="Ticket description..."
                              height="220px"
                              autoFocus
                            />
                            <Flex gap={8} wrap="wrap">
                              <Button
                                type="primary"
                                loading={ticketDescriptionSaving}
                                onClick={() => void onTicketDescriptionSave?.()}
                              >
                                Save description
                              </Button>
                              <Button onClick={onTicketDescriptionEditingCancel}>Cancel</Button>
                            </Flex>
                          </Space>
                        ) : (
                          <>
                            <CommentHtml html={ticketData.description || ''} />
                            <OriginalDescriptionCollapse ticketData={ticketData} />
                          </>
                        )}
                        {ticketAttachments.length > 0 && (
                          <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                            {ticketAttachments.map((att) => (
                              <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <PaperClipOutlined /> {att.file_name}
                              </a>
                            ))}
                          </Flex>
                        )}
                      </Flex>

            <div style={{ padding: '0 16px', marginTop: 8, marginBottom: 4, textAlign: 'center' }}>
              {commentsHasOlder ? (
                <Button
                  type="link"
                  loading={loadMoreCommentsLoading}
                  onClick={() => onLoadMoreComments?.()}
                  style={{ border: '1px solid #d9d9d9', borderRadius: 20, padding: '10px 20px' }}
                >
                  {commentsOlderRemaining > 0 ? ` (+${commentsOlderRemaining} Conversations)` : ''}
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
                        : comment.visibility === 'note'
                          ? 'var(--ticket-thread-border-agent-note)'
                          : 'var(--ticket-thread-border-agent-reply)'
                    /** Per-side borders: `border` shorthand + only left/right override can drop other sides in some layouts. */
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
                    const threadRole = isAutomation
                      ? 'automation'
                      : isCustomer
                        ? 'customer'
                        : comment.visibility === 'note'
                          ? 'agent-note'
                          : 'agent-reply'
                    const threadBgVar =
                      threadRole === 'automation'
                        ? 'var(--ticket-thread-bubble-automation)'
                        : threadRole === 'customer'
                          ? 'var(--ticket-thread-bubble-customer)'
                          : threadRole === 'agent-note'
                            ? 'var(--ticket-thread-bubble-agent-note)'
                            : 'var(--ticket-thread-bubble-agent-reply)'
                    return (
                    <div
                      key={comment.id}
                      className={`ticket-thread-bubble ticket-thread-bubble--${threadRole}`}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        color: 'var(--ticket-thread-text)',
                        backgroundColor: threadBgVar,
                        ...threadBubbleBorder,
                      }}
                    >
                    <Flex vertical gap={10} style={{ width: '100%' }}>
                      <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                          <Space>
                          {isAutomation ? (
                            <Avatar size="small" style={{ backgroundColor: '#0E7490' }} icon={<ThunderboltOutlined />} />
                          ) : (
                            <TicketUserMention userId={comment.user_id} email={comment.user?.email}>
                              <Avatar
                                size="small"
                                style={{ cursor: comment.user_id ? 'pointer' : undefined }}
                                icon={<UserOutlined />}
                                src={comment.user?.avatar_url}
                              />
                            </TicketUserMention>
                          )}
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
                            {!isAutomation && (
                              <Tag color={isCustomer ? 'cyan' : 'gold'}>{isCustomer ? 'Customer' : 'Agent'}</Tag>
                            )}
                            {showNoteOption && (
                              <Tag color={comment.visibility === 'note' ? 'default' : 'blue'}>
                                {comment.visibility === 'note' ? 'Note' : 'Reply'}
                              </Tag>
                            )}
                            <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}>
                              <DateDisplay date={comment.created_at} format="relative" />
                            </Text>
                          </Space>
                          {!isAutomation && editingComment !== comment.id && (
                            <Space>
                              {aiConfigured && showNoteOption && onAddAiSummaryComment && ticketData?.id ? (
                                <CommentAiSummaryTrigger
                                  ticketId={ticketData.id}
                                  summarizeAnchor={{ type: 'comment', commentId: comment.id }}
                                  size="middle"
                                  addCommentLoading={addCommentLoading}
                                  disabled={addCommentLoading}
                                  onAddComment={onAddAiSummaryComment}
                                  onAddChecklistItems={onAddChecklistItemsBulk}
                                />
                              ) : null}
                              {!isCustomer && (comment.user_id === currentUserId || comment.visibility === 'note') ? (
                                <>
                                  <Button
                                    icon={<EditOutlined />}
                                    size="middle"
                                    onClick={() => {
                                      onEditComment(comment.id, comment.comment)
                                    }}
                                  />
                                  {canDeleteComment(comment.created_at) ? (
                                    <Popconfirm
                                      title="Delete comment"
                                      description="Are you sure?"
                                      onConfirm={() => onDeleteComment(comment.id)}
                                      okText="Yes"
                                      cancelText="No"
                                    >
                                      <Button danger icon={<DeleteOutlined />} size="middle" />
                                    </Popconfirm>
                                  ) : null}
                                </>
                              ) : null}
                            </Space>
                          )}
                        </Flex>
                        <CommentTaggedCcLines
                          tagged_users={comment.tagged_users}
                          tagged_user_ids={comment.tagged_user_ids}
                          cc_emails={comment.cc_emails}
                          bcc_emails={comment.bcc_emails}
                          resolveUser={(id) => {
                            const u =
                              nonCustomerUsers?.find((x) => x.id === id) ||
                              companyCustomers?.find((x) => x.id === id)
                            if (!u) return null
                            return { email: u.email, label: u.full_name || u.email }
                          }}
                        />
                        <Space orientation="vertical" size="small" style={{ width: '100%', marginTop: 4 }}>
                        
                          {editingComment === comment.id ? (
                            <Flex vertical gap={8} style={{ width: '100%' }}>
                              <CommentWysiwyg
                                ticketId={ticketData?.id}
                                value={editingCommentValue}
                                onChange={onEditingCommentValueChange}
                                height="200px"
                              />
                              <Space>
                                <Button
                                  type="primary"
                                  
                                  onClick={() => onSaveEditComment(comment.id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  
                                  onClick={onCancelEditComment}
                                >
                                  Cancel
                                </Button>
                              </Space>
                            </Flex>
                          ) : comment.comment && /<[a-z][\s\S]*>/i.test(comment.comment) ? (
                            <CommentHtml html={comment.comment} />
                          ) : (
                            <Paragraph style={{ margin: 0, color: 'var(--ticket-thread-text)' }}>{comment.comment}</Paragraph>
                          )}
                        {comment.via && (
                          <Tag color="geekblue" style={{ marginTop: 6, marginInlineEnd: 0 }}>
                            {comment.via}
                          </Tag>
                        )}
                        {comment.edited_at && editingComment !== comment.id && (
                          <Text style={{ fontSize: 11, color: 'var(--ticket-thread-meta)', fontStyle: 'italic', display: 'block', marginTop: 4 }}>
                            Edited
                            {comment.edited_by_user
                              ? ` by ${comment.edited_by_user.full_name || comment.edited_by_user.email}`
                              : comment.edited_by_user_id && comment.edited_by_user_id !== comment.user_id
                                ? ' by another agent'
                                : ''}
                            {' · '}<DateDisplay date={comment.edited_at} format="relative" />
                          </Text>
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
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'blue', textDecoration: 'underline' }}
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
                commentVisibility={commentVisibility}
                onCommentVisibilityChange={onCommentVisibilityChange}
                showNoteOption={showNoteOption ?? false}
                nonCustomerUsers={nonCustomerUsers}
                companyCustomers={companyCustomers}
                ticketCcEmails={ticketCcEmails}
              />
            </Flex>
          {/* </Card> */}
        </Col>
      </Row>
    </Space>

        {/* Mobile drawer trigger buttons */}
        {isMobile && (
          <div style={{ position: 'fixed', bottom: 80, right: 16, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button shape="circle" icon={<ProfileOutlined />} onClick={() => setDrawerAttrOpen(true)} style={{ background: '#0F172A', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} />
            {ticketData?.company_id && (
              <Button shape="circle" icon={<UserOutlined />} onClick={() => setDrawerCompanyOpen(true)} style={{ background: '#0F172A', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} />
            )}
          </div>
        )}

        {/* Attributes sidebar — left of company */}
        {!isMobile && !rightCollapsed && createPortal(<div className="app-panel" style={{
            width: ATTR_W,
            position: 'fixed',
            right: (COMP_W ? COMP_W + PANEL_GAP : 0) + PANEL_GAP,
            top: PANEL_GAP,
            bottom: PANEL_GAP,
            zIndex: 200,
            transition: 'width 0.2s, right 0.2s',
          }}>
          <div style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: rightCollapsed ? 'center' : 'space-between',
            padding: rightCollapsed ? '0 16px' : '0 12px 0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}>
            {rightCollapsed && <ProfileOutlined style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }} />}
            {!rightCollapsed && (
              <span style={{ color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProfileOutlined />
                Attributes
              </span>
            )}
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label="Close attributes"
              onClick={() => setRightCollapsed(true)}
              style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}
            />
          </div>
          {!rightCollapsed && (
          <>
          {sidebarDirty && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <Flex gap={8}>
                <Button type="primary" block loading={sidebarAttributesSaving} onClick={() => void onSaveSidebarAttributes(sidebarDraft)}>
                  {sidebarAttributesSaving ? 'Saving…' : 'Save changes'}
                </Button>
                <Button block disabled={sidebarAttributesSaving} onClick={() => setSidebarDraft(sidebarBaseline)} style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>Reset</Button>
              </Flex>
            </div>
          )}
          <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">

            {/* Status / Project status */}
            <div>
              <Text style={LBL}>{useProjectBoardStatus ? 'Project status' : 'Status'}</Text>
              {useProjectBoardStatus ? (
                <Select
                  value={sidebarDraft.projectStatusId ?? undefined}
                  onChange={(v) => setSidebarDraft((d) => ({ ...d, projectStatusId: v ?? null }))}
                  loading={sidebarAttributesSaving}
                  options={(projectStatusOptions ?? []).map((s) => ({ value: s.id, label: <Tag color={s.color} style={{ margin: 0 }}>{s.title}</Tag> }))}
                  style={{ width: '100%' }} allowClear placeholder="Board column"
                />
              ) : (
                <Select
                  value={sidebarDraft.status ?? undefined}
                  onChange={(value) => value && setSidebarDraft((d) => ({ ...d, status: String(value) }))}
                  loading={sidebarAttributesSaving}
                  options={statusSelectOptions.map((s) => ({ value: s.slug, label: <Tag color={s.color} style={{ margin: 0 }}>{s.title}</Tag> }))}
                  style={{ width: '100%' }} allowClear={false}
                />
              )}
            </div>

            {/* Type */}
            <div>
              <Text style={LBL}>Type</Text>
              <Select
                value={sidebarDraft.typeId ?? undefined}
                onChange={(v) => setSidebarDraft((d) => ({ ...d, typeId: v ?? null }))}
                loading={sidebarAttributesSaving || (sidebarDraft.typeId != null && typeOptions.length === 0)}
                options={typeOptions.map((t) => ({ value: t.id, label: <Tag color={t.color} style={{ margin: 0 }}>{t.title}</Tag> }))}
                labelRender={(props) => {
                  const found = typeOptions.find((t) => t.id === (props.value as number))
                  return found ? <Tag color={found.color} style={{ margin: 0 }}>{found.title}</Tag> : <span style={{ color: '#999' }}>Loading…</span>
                }}
                style={{ width: '100%' }} allowClear placeholder="Select type"
              />
            </div>

            {/* Priority */}
            <div>
              <Text style={LBL}>Priority</Text>
              <Tooltip title="Integer rank within the company support queue (1 = highest). Leave empty for unranked.">
                <InputNumber
                  min={1} precision={0}
                  value={sidebarDraft.priority}
                  onChange={(v) => setSidebarDraft((d) => ({ ...d, priority: v == null || !Number.isFinite(Number(v)) ? null : Math.max(1, Math.floor(Number(v))) }))}
                  disabled={sidebarAttributesSaving}
                  placeholder="Rank" style={{ width: '100%' }}
                />
              </Tooltip>
            </div>

            {/* Company */}
            <div>
              <Text style={LBL}>Company</Text>
              {canEditCompanyAndTags ? (
                <Select
                  value={sidebarDraft.companyId ?? undefined}
                  onChange={(v) => setSidebarDraft((d) => ({ ...d, companyId: v ?? null }))}
                  loading={sidebarAttributesSaving}
                  options={companyOptions.map((c) => ({ value: c.id, label: c.name }))}
                  showSearch optionFilterProp="label" style={{ width: '100%' }} allowClear placeholder="Select company"
                />
              ) : (
                <Text style={VAL}>{companyOptions.find((c) => c.id === ticketData.company_id)?.name ?? (ticketData.company?.name || '—')}</Text>
              )}
            </div>

            {/* Tags */}
            <div>
              <Text style={LBL}>Tags</Text>
              {canEditCompanyAndTags ? (
                <Select
                  mode="multiple"
                  value={sidebarDraft.tagIds}
                  onChange={(v) => setSidebarDraft((d) => ({ ...d, tagIds: v ?? [] }))}
                  loading={sidebarAttributesSaving}
                  options={tagOptions.map((t) => ({ value: t.id, label: t.name }))}
                  style={{ width: '100%' }} placeholder="Select tags" allowClear
                />
              ) : (
                <Text style={VAL}>{selectedTagIds.length > 0 ? tagOptions.filter((t) => selectedTagIds.includes(t.id)).map((t) => t.name).join(', ') : '—'}</Text>
              )}
            </div>

            {/* Contact */}
            {canEditCompanyAndTags ? (
              <div>
                <Text style={LBL}>Contact (email replies)</Text>
                <Select
                  value={sidebarDraft.contactUserId ?? undefined}
                  allowClear placeholder="Same as Created By"
                  loading={sidebarAttributesSaving}
                  onChange={(v) => setSidebarDraft((d) => ({ ...d, contactUserId: (v as string | undefined) ?? null }))}
                  options={contactUserOptions.map((u) => ({
                    value: u.id,
                    label: `${u.full_name ? `${u.full_name} (${u.email})` : u.email}${u._type === 'customer' ? ' [Customer]' : ''}`,
                  }))}
                  style={{ width: '100%' }} showSearch optionFilterProp="label"
                />
                {contactCrossCompanyHint ? <Alert type="warning" showIcon message={contactCrossCompanyHint} style={{ marginTop: 8 }} /> : null}
              </div>
            ) : ticketData.contact?.id && ticketData.contact.id !== creatorId ? (
              <div>
                <Text style={LBL}>Contact</Text>
                <TicketUserMention userId={ticketData.contact.id} email={ticketData.contact.email}>
                  <Space style={{ cursor: 'pointer' }}>
                    <UserOutlined style={{ color: 'rgba(255,255,255,0.65)' }} />
                    <Text style={VAL}>{ticketData.contact.full_name || ticketData.contact.email}</Text>
                  </Space>
                </TicketUserMention>
              </div>
            ) : null}

            {/* CC */}
            {ticketCcEmails?.length ? (
              <div>
                <Text style={LBL}>CC Recipients</Text>
                <Text style={{ ...VAL, fontSize: 12 }}>{ticketCcEmails.join(', ')}</Text>
              </div>
            ) : null}

            {/* Due Date */}
            <div>
              <Text style={LBL}>Due Date</Text>
              <DatePicker
                value={sidebarDraft.dueDate ? dayjs(sidebarDraft.dueDate) : null}
                onChange={(dt) => setSidebarDraft((d) => ({ ...d, dueDate: dt ? dt.toISOString() : null }))}
                allowClear showTime format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }} disabled={sidebarAttributesSaving}
              />
            </div>

            {/* Price (billing): per hour, or fixed for the whole ticket */}
            {canEditBilling ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <Text style={{ ...LBL, marginBottom: 0 }}>Price</Text>
                  <Segmented<'hourly' | 'fixed'>
                    size="small"
                    value={sidebarDraft.pricing}
                    onChange={(pricing) => setSidebarDraft((d) => ({ ...d, pricing }))}
                    options={[
                      { value: 'hourly', label: 'Per hour' },
                      { value: 'fixed', label: 'Fixed' },
                    ]}
                    disabled={sidebarAttributesSaving}
                  />
                </div>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    value={sidebarDraft.rateCurrency ?? DEFAULT_RATE_CURRENCY}
                    onChange={(c) => setSidebarDraft((d) => ({ ...d, rateCurrency: c }))}
                    options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))}
                    style={{ width: 90 }}
                    disabled={sidebarAttributesSaving}
                  />
                  <InputNumber
                    key={sidebarDraft.pricing}
                    value={(sidebarDraft.pricing === 'fixed' ? sidebarDraft.fixedPrice : sidebarDraft.hourlyRate) ?? undefined}
                    onChange={(v) =>
                      setSidebarDraft((d) => ({
                        ...d,
                        [d.pricing === 'fixed' ? 'fixedPrice' : 'hourlyRate']: typeof v === 'number' ? v : null,
                        rateCurrency: d.rateCurrency ?? DEFAULT_RATE_CURRENCY,
                      }))
                    }
                    min={0}
                    step={(sidebarDraft.rateCurrency ?? DEFAULT_RATE_CURRENCY) === 'IDR' ? (sidebarDraft.pricing === 'fixed' ? 100000 : 1000) : 1}
                    placeholder={sidebarDraft.pricing === 'fixed' ? 'whole ticket, any hours' : 'per hour'}
                    style={{ width: '100%' }}
                    disabled={sidebarAttributesSaving}
                  />
                </Space.Compact>
              </div>
            ) : null}

            {/* Team */}
            <div>
              <Text style={LBL}>Team</Text>
              {canEditAssignees ? (
                <Select
                  value={sidebarDraft.teamId ?? undefined}
                  onChange={(teamId) => setSidebarDraft((d) => ({ ...d, teamId: teamId ?? null }))}
                  loading={sidebarAttributesSaving}
                  options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
                  style={{ width: '100%' }} placeholder="Select team" allowClear
                />
              ) : (
                <Text style={VAL}>{ticketData.team?.name ?? '—'}</Text>
              )}
            </div>

            {/* Skills this ticket needs: decides who is suggested below */}
            <div>
              <Text style={LBL}>Skills needed</Text>
              {canEditAssignees ? (
                <SkillsSelect
                  value={sidebarDraft.requiredSkills}
                  onChange={(skills) => setSidebarDraft((d) => ({ ...d, requiredSkills: skills }))}
                  placeholder={
                    Array.isArray(ticketData?.inherited_skills) && ticketData.inherited_skills.length
                      ? `Inherited (${ticketData.inherited_from === 'client' ? 'client' : 'type / tags'}): ${ticketData.inherited_skills.join(', ')}`
                      : 'e.g. WordPress, Billing'
                  }
                  disabled={sidebarAttributesSaving}
                />
              ) : (
                <Text style={VAL}>{sidebarDraft.requiredSkills.length ? sidebarDraft.requiredSkills.join(', ') : '—'}</Text>
              )}
            </div>

            {/* Assignees */}
            <div>
              <Text style={LBL}>Assignees</Text>
              {canEditAssignees ? (
                <Select
                  mode="multiple"
                  value={sidebarDraft.assigneeIds}
                  onChange={(ids) => setSidebarDraft((d) => ({ ...d, assigneeIds: ids ?? [] }))}
                  loading={sidebarAttributesSaving}
                  options={(nonCustomerUsers ?? []).map((u) => ({ value: u.id, label: u.full_name ? `${u.full_name} (${u.email})` : u.email }))}
                  style={{ width: '100%' }} placeholder="Select assignees" allowClear showSearch optionFilterProp="label"
                />
              ) : (
                <Text style={VAL}>
                  {sidebarDraft.assigneeIds.length > 0
                    ? (nonCustomerUsers ?? []).filter((u) => sidebarDraft.assigneeIds.includes(u.id)).map((u) => u.full_name || u.email).join(', ') || '—'
                    : '—'}
                </Text>
              )}
              {canEditAssignees && ticketData?.id ? (
                <SuggestedAgents
                  ticketId={ticketData.id}
                  assigneeIds={sidebarDraft.assigneeIds}
                  refreshKey={ticketData?.updated_at ?? ''}
                  skills={sidebarDraft.requiredSkills}
                  onAdd={(userId) => setSidebarDraft((d) => ({ ...d, assigneeIds: [...new Set([...d.assigneeIds, userId])] }))}
                />
              ) : null}
            </div>

            {/* Total Time */}
            <div>
              <Text style={LBL}>Total Time Tracked</Text>
              <Space>
                <ClockCircleOutlined style={{ color: 'rgba(255,255,255,0.65)' }} />
                <Text style={{ color: '#fff', fontWeight: 600 }}>
                  <TrackerElapsed totalTimeSeconds={totalTimeSeconds} activeTimeTracker={activeTimeTracker} formatTime={formatTime} />
                </Text>
              </Space>
            </div>

            {/* Custom attributes */}
            {attributes.map((attr) => (
              <div key={attr.id}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                  <Text style={LBL}>{attr.meta_key}</Text>
                  {editingAttribute === attr.id ? (
                    <Button type="text" size="small" onClick={() => onEditingAttributeChange(null)} style={{ color: 'rgba(255,255,255,0.65)', padding: '0 4px' }}>Cancel</Button>
                  ) : (
                    <Flex gap={4}>
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEditingAttributeChange(attr.id)} style={{ color: 'rgba(255,255,255,0.65)' }} />
                      <Popconfirm title="Delete attribute" description="Are you sure?" onConfirm={() => onDeleteAttribute(attr.id)} okText="Yes" cancelText="No">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Flex>
                  )}
                </Flex>
                {editingAttribute === attr.id ? (
                  <Input
                    defaultValue={attr.meta_value || ''}
                    onPressEnter={(e) => onUpdateAttribute(attr.id, e.currentTarget.value)}
                    onBlur={(e) => onUpdateAttribute(attr.id, e.target.value)}
                    autoFocus style={{ width: '100%' }}
                  />
                ) : attr.meta_value && isUrl(attr.meta_value) ? (
                  <a href={attr.meta_value.trim()} target="_blank" rel="noopener noreferrer" title={attr.meta_value.trim()} style={{ color: '#4096ff', wordBreak: 'break-all' }}>
                    {shortenUrl(attr.meta_value)}
                  </a>
                ) : (
                  <Text style={VAL}>{attr.meta_value || '—'}</Text>
                )}
              </div>
            ))}

            {/* Add new attribute */}
            <div>
              <Text style={LBL}>Add attribute</Text>
              <Flex gap={6} vertical>
                <Input placeholder="Key" value={newAttributeKey} onChange={e => onNewAttributeKeyChange(e.target.value)} />
                <Input placeholder="Value" value={newAttributeValue} onChange={e => onNewAttributeValueChange(e.target.value)} onPressEnter={onAddAttribute} />
                <Button type="primary" icon={<PlusOutlined />} onClick={onAddAttribute} disabled={!newAttributeKey.trim()} loading={attributesLoading} block>Add attribute</Button>
              </Flex>
            </div>

          </Space>
          </div>
          </>
          )}
        </div>, document.body)}

        {/* Company Info sidebar — paling kanan, right: 0 */}
        {!isMobile && !companyCollapsed && createPortal(<div className="app-panel" style={{
            width: COMP_W,
            position: 'fixed',
            right: PANEL_GAP,
            top: PANEL_GAP,
            bottom: PANEL_GAP,
            zIndex: 199,
            transition: 'width 0.2s',
          }}>
          <div style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: companyCollapsed ? 'center' : 'space-between',
            padding: companyCollapsed ? '0 16px' : '0 12px 0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}>
            {!companyCollapsed && (
              <span style={{ color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserOutlined />
                Company Info
              </span>
            )}
            {companyCollapsed && <UserOutlined style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }} />}
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label="Close company info"
              onClick={() => setCompanyCollapsed(true)}
              style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}
            />
          </div>
          {!companyCollapsed && (
            <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!ticketData?.company_id ? (
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>No company linked</Text>
              ) : companyMissing ? (
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Company not found — it may have been deleted.</Text>
              ) : !companyDetail ? (
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Loading...</Text>
              ) : (
                <>
                  {/* Core info */}
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <div>
                      <Text style={{ fontSize: 11, display: 'block', marginBottom: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Company</Text>
                      <Text style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{companyDetail.name}</Text>
                    </div>
                    {companyDetail.email && (
                      <div>
                        <Text style={{ fontSize: 11, display: 'block', marginBottom: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Email</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', wordBreak: 'break-all', fontSize: 12 }}>{companyDetail.email}</Text>
                      </div>
                    )}
                    {companyDetail.active_manager_id && (
                      <div>
                        <Text style={{ fontSize: 11, display: 'block', marginBottom: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Manager</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                          {nonCustomerUsers?.find(u => u.id === companyDetail!.active_manager_id)?.full_name ||
                           nonCustomerUsers?.find(u => u.id === companyDetail!.active_manager_id)?.email || '—'}
                        </Text>
                      </div>
                    )}
                    {companyDetail.active_team_id && (
                      <div>
                        <Text style={{ fontSize: 11, display: 'block', marginBottom: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Team</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                          {teamOptions?.find(t => t.id === companyDetail!.active_team_id)?.name || '—'}
                        </Text>
                      </div>
                    )}
                    {companyDetail.domainList && companyDetail.domainList.length > 0 && (
                      <div>
                        <Text style={{ fontSize: 11, display: 'block', marginBottom: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Domains</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>{companyDetail.domainList.join(', ')}</Text>
                      </div>
                    )}
                  </Space>

                  {/* Today total hours + active tracker — isolated component owns its own 1s timer */}
                  {companyTodaySeconds !== null && (
                    <CompanyTodayTotal
                      completedSeconds={companyTodaySeconds}
                      hasActiveTracker={companyHasActiveTracker}
                      activeTrackerUserName={companyActiveTrackerUser}
                      activeTrackerStartTime={companyActiveTrackerStart}
                      activeTrackers={companyActiveTrackers}
                    />
                  )}

                  {/* Top tickets */}
                  {topTickets.length > 0 && (
                    <div>
                      <Text style={{ fontSize: 11, display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Top Tickets</Text>
                      <Space direction="vertical" style={{ width: '100%' }} size={4}>
                        {topTickets.map(t => (
                          <div
                            key={t.id}
                            onClick={() => window.open(`/tickets/${t.id}`, '_blank')}
                            style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                              <Text style={{ color: '#5EEAD4', fontSize: 11, flexShrink: 0, fontWeight: 600 }}>#{t.id}</Text>
                              {t.priority != null && (
                                <span style={{ fontSize: 10, background: 'rgba(22,119,255,0.2)', color: '#69b1ff', borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>
                                  P{t.priority}
                                </span>
                              )}
                              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', borderRadius: 3, padding: '0 4px', flexShrink: 0, textTransform: 'capitalize' }}>
                                {t.status}
                              </span>
                            </div>
                            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, lineHeight: '15px', display: 'block' }} ellipsis={{ tooltip: t.title }}>{t.title}</Text>
                          </div>
                        ))}
                      </Space>
                    </div>
                  )}

                  {/* Custom attributes */}
                  <div>
                    <Text style={{ fontSize: 11, display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Custom Attributes</Text>
                    <Space direction="vertical" style={{ width: '100%' }} size={4}>
                      {companyAttrs.length === 0 && (
                        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>—</Text>
                      )}
                      {companyAttrs.map(attr => (
                        <div key={attr.id} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', display: 'block' }}>{attr.meta_key}</Text>
                          {attr.meta_value && isUrl(attr.meta_value) ? (
                            <a href={attr.meta_value} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, wordBreak: 'break-all' }}>{shortenUrl(attr.meta_value)}</a>
                          ) : (
                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{attr.meta_value || '—'}</Text>
                          )}
                        </div>
                      ))}
                    </Space>
                  </div>

                  <Button
                    block
                    onClick={() => window.open(`/companies/${ticketData.company_id}`, '_blank')}
                    style={{ marginTop: 'auto' }}
                  >
                    View Company →
                  </Button>
                </>
              )}
            </div>
          )}
        </div>, document.body)}

        {/* Mobile Drawers */}
        <Drawer
          title={<span style={{ color: '#fff' }}>Attributes</span>}
          placement="right"
          open={isMobile && drawerAttrOpen}
          onClose={() => setDrawerAttrOpen(false)}
          width={Math.min(320, window?.innerWidth ?? 320)}
          styles={{ body: { background: '#0F172A', padding: 16 }, header: { background: '#0F172A', borderBottom: '1px solid rgba(148,163,184,0.14)' }, wrapper: { background: '#0F172A' } }}
          closeIcon={<span style={{ color: '#fff' }}>✕</span>}
        >
          <div style={{ color: '#fff' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Sidebar attributes visible on desktop only</Text>
          </div>
        </Drawer>

        <Drawer
          title={<span style={{ color: '#fff' }}>Company Info</span>}
          placement="right"
          open={isMobile && drawerCompanyOpen}
          onClose={() => setDrawerCompanyOpen(false)}
          width={Math.min(320, window?.innerWidth ?? 320)}
          styles={{ body: { background: '#0F172A', padding: 16 }, header: { background: '#0F172A', borderBottom: '1px solid rgba(148,163,184,0.14)' }, wrapper: { background: '#0F172A' } }}
          closeIcon={<span style={{ color: '#fff' }}>✕</span>}
        >
          <div style={{ color: '#fff' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Company info visible on desktop only</Text>
          </div>
        </Drawer>
    </>
  )
}
