'use client'

import 'react-quill-new/dist/quill.snow.css'

import { BankOutlined, DeleteOutlined, EditOutlined, FileMarkdownOutlined, FolderOutlined, LeftOutlined, PrinterOutlined, ProfileOutlined, RightOutlined, StopOutlined, WarningOutlined } from '@ant-design/icons'
import { Button, Card, Dropdown, Flex, Form, Grid, Input, Layout, message, Tabs, Tag, Tooltip, Typography } from 'antd'

const { useBreakpoint } = Grid
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BRANDING } from '@/lib/branding'
import { isTicketFolder, TICKET_FOLDER_LABELS } from '@/lib/ticket-classification'
import { uploadTicketFile } from '@/utils/storage'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import dayjs from 'dayjs'

import BackLink from '@/components/common/BackLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { TabActivity, TabChecklist, TabGeneral, TabTimeTracker } from '@/components/ticket/detail'
import type { SidebarAttributesDraft } from '@/components/ticket/detail/TabGeneral'
import TabGeneralCustomer from '@/components/ticket/detail/TabGeneralCustomer'
import TicketPresenceBar from '@/components/ticket/TicketPresenceBar'
import { canDeleteTickets, isAdmin, isAdminOrManager } from '@/lib/auth-utils'
import { useTicketDetailLiveSync } from '@/lib/firebase/useTicketDetailLiveSync'
import { linkifyRichHtml } from '@/lib/linkify-rich-html'

const { Content } = Layout
const { Title, Text } = Typography

/** Billing fields for PATCH: either an hourly rate or a fixed price for the whole ticket (the other is cleared) */
function ticketPricePayload(d: SidebarAttributesDraft) {
    const fixed = d.pricing === 'fixed'
    const amount = fixed ? d.fixedPrice : d.hourlyRate
    return {
        hourly_rate: fixed ? null : d.hourlyRate,
        fixed_price: fixed ? d.fixedPrice : null,
        rate_currency: amount != null ? d.rateCurrency : null,
    }
}

function TitleDisplay({ id, title }: { id: number; title: string }) {
    const [expanded, setExpanded] = useState(false)
    const isLong = title.length > 80
    return (
        <span style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span
                style={{
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: expanded ? 'unset' : 2,
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                }}
            >
                #{id} {title}
            </span>
            {isLong && (
                <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: 12, height: 'auto' }}
                    onClick={() => setExpanded((e) => !e)}
                >
                    {expanded ? 'show less' : 'show more'}
                </Button>
            )}
        </span>
    )
}

interface Screenshot {
    id: string
    file_name: string
    file_path: string
    file_url: string
    file_size: number
    mime_type: string
    ticket_id: number | null
    title: string | null
    description: string | null
    created_at: string
    updated_at: string
}

export interface TicketDetailContentProps {
    user: { id: string; email?: string | null; name?: string | null; image?: string | null; role?: string }
    ticketData: any
    checklistItems: any[]
    comments: any[]
    attributes: any[]
    screenshots?: Screenshot[]
    tags?: Array<{ id: string; name: string; slug: string; color?: string }>
    /** Emails ever CC'd on this ticket - used to pre-fill CC on replies */
    ticketCcEmails?: string[]
    /** More comments exist older than the initial window */
    commentsHasOlder?: boolean
    /** Cursor for GET .../comments/older */
    commentsOlderCursor?: { created_at: string; id: string } | null
    /** Count of comments older than the loaded window (same visibility rules as list) */
    commentsOlderRemaining?: number
    /** 'customer' = navbar layout, back to /customer; 'admin' = sidebar layout (default) */
    variant?: 'admin' | 'customer'
}

interface ChecklistItem {
    id: string
    ticket_id: number
    title: string
    is_completed: boolean
    order_index: number
    group_name: string | null
    created_at: string
    completed_at: string | null
    completed_by_user_id: string | null
    completed_by_name: string | null
    completion_note: string | null
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
    user?: {
        id: string
        full_name: string | null
        email: string
    }
    comment_attachments?: CommentAttachment[] | null
    tagged_user_ids?: string[]
    tagged_users?: { id: string; full_name: string | null; email: string }[]
    cc_emails?: string[]
    bcc_emails?: string[]
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

export default function TicketDetailContent({
    user: currentUser,
    ticketData,
    checklistItems: initialChecklistItems,
    comments: initialComments,
    attributes: initialAttributes,
    screenshots: initialScreenshots = [],
    tags: initialTags = [],
    ticketCcEmails: initialTicketCcEmails = [],
    commentsHasOlder: initialCommentsHasOlder = false,
    commentsOlderCursor: initialCommentsOlderCursor = null,
    commentsOlderRemaining: initialCommentsOlderRemaining = 0,
    variant = 'admin',
}: TicketDetailContentProps) {
    const router = useRouter()
    const screens = useBreakpoint()
    const isMobile = !screens.md
    /** Side panels start closed; the last choice is remembered in this browser. */
    const [attrSidebarCollapsed, setAttrSidebarCollapsedState] = useState(true)
    const [companySidebarCollapsed, setCompanySidebarCollapsedState] = useState(true)
    useEffect(() => {
        try {
            setAttrSidebarCollapsedState(localStorage.getItem('ticket-panel-attributes') !== 'open')
            setCompanySidebarCollapsedState(localStorage.getItem('ticket-panel-company') !== 'open')
        } catch {
            /* storage unavailable */
        }
    }, [])
    const setAttrSidebarCollapsed = (v: boolean) => {
        setAttrSidebarCollapsedState(v)
        try { localStorage.setItem('ticket-panel-attributes', v ? 'closed' : 'open') } catch { /* ignore */ }
    }
    const setCompanySidebarCollapsed = (v: boolean) => {
        setCompanySidebarCollapsedState(v)
        try { localStorage.setItem('ticket-panel-company', v ? 'closed' : 'open') } catch { /* ignore */ }
    }
    const [displayTicket, setDisplayTicket] = useState(ticketData)
    const liveSyncTicketIdRef = useRef<number | undefined>(ticketData?.id)
    liveSyncTicketIdRef.current = displayTicket?.id
    const [screenshots, setScreenshots] = useState(initialScreenshots)
    const [ticketCcEmailsState, setTicketCcEmailsState] = useState(initialTicketCcEmails)

    useEffect(() => {
        setDisplayTicket(ticketData)
    }, [ticketData])

    useEffect(() => {
        setScreenshots(initialScreenshots)
        setTicketCcEmailsState(initialTicketCcEmails)
    }, [ticketData?.id, initialScreenshots, initialTicketCcEmails])

    const [collapsed, setCollapsed] = useState(true)
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(initialChecklistItems)
    const [comments, setComments] = useState<Comment[]>(initialComments)
    const [commentsHasOlder, setCommentsHasOlder] = useState(initialCommentsHasOlder)
    const [olderCursor, setOlderCursor] = useState<{ created_at: string; id: string } | null>(
        initialCommentsOlderCursor,
    )
    const [loadingMoreComments, setLoadingMoreComments] = useState(false)
    const [commentsOlderRemaining, setCommentsOlderRemaining] = useState(initialCommentsOlderRemaining)
    const [attributes, setAttributes] = useState<Attribute[]>(initialAttributes)

    useEffect(() => {
        setCommentsHasOlder(initialCommentsHasOlder)
        setOlderCursor(initialCommentsOlderCursor)
        setCommentsOlderRemaining(initialCommentsOlderRemaining)
    }, [ticketData?.id, initialCommentsHasOlder, initialCommentsOlderCursor, initialCommentsOlderRemaining])

    const [loading, setLoading] = useState(false)
    const [classifyLoading, setClassifyLoading] = useState<'support' | 'spam' | 'trash' | 'notification' | null>(null)
    const [nextTicketNavLoading, setNextTicketNavLoading] = useState(false)
    const [newChecklistTitle, setNewChecklistTitle] = useState('')
    const [commentVisibility, setCommentVisibility] = useState<'note' | 'reply' | null>(null)
    useEffect(() => {
        setCommentVisibility(null)
    }, [displayTicket?.id])
    const [editingComment, setEditingComment] = useState<string | null>(null)
    const [editingCommentValue, setEditingCommentValue] = useState('')
    const [removingCommentAttachmentKey, setRemovingCommentAttachmentKey] = useState<string | null>(null)
    const [editingAttribute, setEditingAttribute] = useState<string | null>(null)
    const [newAttributeKey, setNewAttributeKey] = useState('')
    const [newAttributeValue, setNewAttributeValue] = useState('')
    const [editingDescription, setEditingDescription] = useState(false)
    const editingDescriptionRef = useRef(false)
    const sidebarSavingRef = useRef(false)
    useEffect(() => {
        editingDescriptionRef.current = editingDescription
    }, [editingDescription])
    const [descriptionValue, setDescriptionValue] = useState(() => (typeof ticketData?.description === 'string' ? ticketData.description : '') || '')
    const [aiConfigured, setAiConfigured] = useState(false)
    useEffect(() => {
        fetch('/api/ai-settings/status').then(r => r.json()).then(j => setAiConfigured(!!j.configured)).catch(() => {})
    }, [])
    const [editModalVisible, setEditModalVisible] = useState(false)
    const [titleEditing, setTitleEditing] = useState(false)
    const [titleDraft, setTitleDraft] = useState('')
    useEffect(() => {
        if (!titleEditing && displayTicket?.title != null) {
            setTitleDraft(String(displayTicket.title))
        }
    }, [displayTicket?.title, displayTicket?.id, titleEditing])
    useEffect(() => {
        setTitleEditing(false)
    }, [displayTicket?.id])
    const [teams, setTeams] = useState<any[]>([])
    /** Signed-in user’s team memberships (from /api/tickets/lookup); used to narrow team options for non-public tickets. */
    const [users, setUsers] = useState<any[]>([])
    const [companyCustomers, setCompanyCustomers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
    const [ticketTypes, setTicketTypes] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
    const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
    const [allTags, setAllTags] = useState<Array<{ id: string; name: string; slug: string }>>([])
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => (Array.isArray(initialTags) ? initialTags.map((t) => t?.id).filter(Boolean) as string[] : []))
    const [descriptionAttachmentsFromDb, setDescriptionAttachmentsFromDb] = useState<{ id: string; file_url: string; file_name: string; file_path: string }[]>([])
    const [newDescriptionAttachments, setNewDescriptionAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
    const [deletedDescriptionAttachmentIds, setDeletedDescriptionAttachmentIds] = useState<string[]>([])
    const [statusChanging, setStatusChanging] = useState(false)
    const [customerChangesSaving, setCustomerChangesSaving] = useState(false)
    const [form] = Form.useForm()
    const [activeTimeTracker, setActiveTimeTracker] = useState<any>(null)
    const [timeTrackerSessions, setTimeTrackerSessions] = useState<any[]>([])
    const [totalTimeSeconds, setTotalTimeSeconds] = useState<number>(0)
    const [statusesFromDb, setStatusesFromDb] = useState<
        { slug: string; title: string; customer_title?: string; color: string; is_active?: boolean }[]
    >([])
    const [sidebarBaselineTick, setSidebarBaselineTick] = useState(0)
    const [sidebarAttributesSaving, setSidebarAttributesSaving] = useState(false)
    const [activityRefreshKey, setActivityRefreshKey] = useState(0)
    const bumpActivityRefresh = useCallback(() => setActivityRefreshKey((k) => k + 1), [])

    // Mark ticket as read when user views it
    useEffect(() => {
        if (!displayTicket?.id) return
        apiFetch(`/api/tickets/${displayTicket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mark_read: true }),
        }).catch(() => {})
    }, [displayTicket?.id])

    const contactUserOptionsForTicket = useMemo(() => {
        const agentUsers = (users || [])
            .filter((u: { email?: string; role?: string }) => String(u?.email || '').trim() && (u?.role ?? '').toLowerCase() !== 'customer')
            .map((u: any) => ({
                id: u.id as string,
                full_name: (u.full_name ?? null) as string | null,
                email: u.email as string,
                company_id: (u.company_id ?? null) as string | null,
                _type: 'agent' as const,
            }))
        const customerUsers = (companyCustomers || [])
            .filter((u) => String(u?.email || '').trim())
            .map((u) => ({
                id: u.id,
                full_name: u.full_name ?? null,
                email: u.email,
                company_id: displayTicket?.company_id ?? null,
                _type: 'customer' as const,
            }))
        // Customers first, then agents; deduplicate by id (customer wins if same id)
        const seen = new Set<string>()
        const merged = [...customerUsers, ...agentUsers].filter((u) => {
            if (seen.has(u.id)) return false
            seen.add(u.id)
            return true
        })
        return merged
    }, [users, companyCustomers, displayTicket?.company_id])

    // Default status labels/colors when DB has no ticket_statuses (matches seeded slugs)
    const DEFAULT_STATUS_MAP: Record<string, { title: string; color: string }> = {
        open: { title: 'Open', color: 'warning' },
        received: { title: 'Received', color: 'default' },
        question: { title: 'Question', color: 'processing' },
        working_team: { title: 'Working Team', color: 'processing' },
        am_review: { title: 'AM Review', color: 'processing' },
        client_review: { title: 'Client Review', color: 'success' },
        feedback_received: { title: 'Feedback Received', color: 'default' },
        revision: { title: 'Revision', color: 'processing' },
        pending: { title: 'Pending', color: 'default' },
        resolved: { title: 'Resolved', color: 'success' },
        closed: { title: 'Closed', color: 'default' },
    }
    const allStatusesForSelect = statusesFromDb.length > 0
        ? statusesFromDb
        : Object.entries(DEFAULT_STATUS_MAP).map(([slug, { title, color }]) => ({ slug, title, color }))

    useEffect(() => {
        const fetchStatuses = async () => {
            try {
                const data = await apiFetch<{
                    statuses: Array<{
                        slug: string
                        title: string
                        customer_title?: string
                        color: string
                        is_active?: boolean
                    }>
                }>('/api/tickets/lookup')
                if (data?.statuses?.length) {
                    setStatusesFromDb(data.statuses)
                }
            } catch {
                // use DEFAULT_STATUS_MAP via allStatusesForSelect
            }
        }
        fetchStatuses()
    }, [])

    // Inbox sync: use cron POST /api/email/sync-inbox (not on each ticket open).

    // Sync descriptionValue with ticketData.description (only when not editing and value actually changed)
    const descriptionFromProps = typeof displayTicket?.description === 'string' ? displayTicket.description : ''
    useEffect(() => {
        if (!editingDescription) {
            setDescriptionValue((prev: string) => (prev !== descriptionFromProps ? descriptionFromProps : prev))
        }
    }, [descriptionFromProps, editingDescription])

    // Fetch teams and users for edit form
    useEffect(() => {
        const fetchLookup = async () => {
            try {
                const data = await apiFetch<{
                    teams: any[]
                    users: any[]
                    ticketTypes: any[]
                    companies: any[]
                    tags: any[]
                }>('/api/tickets/lookup')
                setTeams(data?.teams || [])
                setUsers(data?.users || [])
                setTicketTypes(data?.ticketTypes || [])
                setCompanies(data?.companies || [])
                setAllTags((data?.tags || []).map((t: any) => ({ id: t.id, name: t.name, slug: t.slug })))
            } catch { /* ignore */ }
        }
        const fetchTimeTrackerSessions = async () => {
            try {
                const data = await apiFetch<any[]>(`/api/tickets/${displayTicket.id}/time-tracker`)
                setTimeTrackerSessions(data || [])
                const total = (data || []).reduce((sum: number, s: any) => {
                    const r = s.reported_duration_seconds
                    if (r != null && Number.isFinite(Number(r))) return sum + Number(r)
                    return sum + (s.duration_seconds || 0)
                }, 0)
                setTotalTimeSeconds(total)
            } catch { /* ignore */ }
        }
        const checkActiveTimeTracker = async () => {
            try {
                const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/time-tracker?active=1`)
                setActiveTimeTracker(data || null)
            } catch { setActiveTimeTracker(null) }
        }
        const fetchCompanyUsers = async () => {
            const cid = displayTicket?.company_id
            if (!cid) {
                setCompanyCustomers([])
                return
            }
            try {
                const data = await apiFetch<{ users: Array<{ id: string; full_name: string | null; email: string }> }>(
                    `/api/companies/${cid}/users`
                )
                setCompanyCustomers(data?.users || [])
            } catch {
                setCompanyCustomers([])
            }
        }
        fetchLookup()
        fetchTimeTrackerSessions()
        checkActiveTimeTracker()
        fetchCompanyUsers()
    }, [displayTicket?.id, displayTicket?.company_id])


    const fetchTimeTrackerSessions = async () => {
        try {
            const data = await apiFetch<any[]>(`/api/tickets/${displayTicket.id}/time-tracker`)
            setTimeTrackerSessions(data || [])
            const total = (data || []).reduce((sum: number, s: any) => {
                const r = s.reported_duration_seconds
                if (r != null && Number.isFinite(Number(r))) return sum + Number(r)
                return sum + (s.duration_seconds || 0)
            }, 0)
            setTotalTimeSeconds(total)
        } catch { /* ignore */ }
    }

    const refreshTimeTracking = async () => {
        await fetchTimeTrackerSessions()
        try {
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/time-tracker?active=1`)
            setActiveTimeTracker(data || null)
        } catch {
            setActiveTimeTracker(null)
        }
    }

    /** Called when Firestore `ticket_data_sync/{id}` changes: refetch ticket detail + comments from the API. */
    const mergeDetailFromServer = useCallback(async () => {
        const id = liveSyncTicketIdRef.current
        if (!id) return
        try {
            const data = await apiFetch<{
                ticketData: any
                checklistItems: ChecklistItem[]
                comments: Comment[]
                comments_has_older?: boolean
                comments_older_cursor?: { created_at: string; id: string } | null
                comments_older_remaining?: number
                attributes: Attribute[]
                screenshots?: Screenshot[]
                tags?: Array<{ id: string; name: string; slug: string; color?: string }>
                ticketCcEmails?: string[]
            }>(`/api/tickets/${id}/detail`)
            setDisplayTicket(data.ticketData)
            setChecklistItems(data.checklistItems)
            setComments(data.comments)
            if (data.comments_has_older !== undefined) setCommentsHasOlder(data.comments_has_older)
            if (data.comments_older_cursor !== undefined) setOlderCursor(data.comments_older_cursor ?? null)
            if (data.comments_older_remaining !== undefined) setCommentsOlderRemaining(data.comments_older_remaining)
            setAttributes(data.attributes)
            setScreenshots(data.screenshots ?? [])
            setTicketCcEmailsState(data.ticketCcEmails ?? [])
            setSelectedTagIds((data.tags ?? []).map((t) => t.id).filter(Boolean))
            if (!editingDescriptionRef.current) {
                setDescriptionValue(
                    typeof data.ticketData?.description === 'string' ? data.ticketData.description : '',
                )
            }
            await refreshTimeTracking()
            try {
                const att = await apiFetch<
                    Array<{ id: string; file_url: string; file_name: string; file_path?: string }>
                >(`/api/tickets/${id}/attachments`)
                setDescriptionAttachmentsFromDb((att || []).map((a) => ({ ...a, file_path: a.file_path ?? '' })))
            } catch {
                /* ignore */
            }
            bumpActivityRefresh()
        } catch (e) {
            console.error('[ticket live sync] refetch failed', e)
        }
    }, [variant, bumpActivityRefresh])

    // User opened this ticket → onSnapshot on ticket_data_sync/{id}; version bump → mergeDetailFromServer.
    useTicketDetailLiveSync(displayTicket?.id, mergeDetailFromServer)

    const handleLoadMoreComments = async () => {
        if (!olderCursor || !displayTicket?.id) return
        setLoadingMoreComments(true)
        try {
            const q = new URLSearchParams({
                before_created_at: olderCursor.created_at,
                before_id: olderCursor.id,
                limit: '10',
            })
            const res = await apiFetch<{
                comments: Comment[]
                comments_has_older: boolean
                comments_older_cursor: { created_at: string; id: string } | null
                comments_older_remaining: number
            }>(`/api/tickets/${displayTicket.id}/comments/older?${q}`)
            setComments((prev) => [...res.comments, ...prev])
            setCommentsHasOlder(res.comments_has_older)
            setOlderCursor(res.comments_older_cursor)
            setCommentsOlderRemaining(res.comments_older_remaining)
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : 'Failed to load older comments')
        } finally {
            setLoadingMoreComments(false)
        }
    }

    const handleStartTimeTracker = async (jobType?: string | null) => {
        setLoading(true)
        try {
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/time-tracker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'start',
                    ...(jobType != null && String(jobType).trim() !== ''
                        ? { job_type: String(jobType).trim() }
                        : {}),
                }),
            })
            setActiveTimeTracker(data)
            message.success('Time tracker started')
        } catch (err: any) {
            message.error(err?.message || 'Failed to start time tracker')
        } finally {
            setLoading(false)
        }
    }

    const handleStopTimeTracker = async () => {
        if (!activeTimeTracker) return
        setLoading(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/time-tracker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop', session_id: activeTimeTracker.id }),
            })
            setActiveTimeTracker(null)
            message.success('Time tracker stopped')
            fetchTimeTrackerSessions()
        } catch (err: any) {
            message.error(err?.message || 'Failed to stop time tracker')
        } finally {
            setLoading(false)
        }
    }

    // Format seconds to readable time
    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`
        } else {
            return `${secs}s`
        }
    }

    const getStatusColor = (status: string) => {
        const fromDb = statusesFromDb.find((s) => s.slug === status)
        if (fromDb?.color) return fromDb.color
        return DEFAULT_STATUS_MAP[status]?.color || 'default'
    }

    const getStatusLabel = (status: string) => {
        const fromDb = statusesFromDb.find((s) => s.slug === status)
        if (fromDb?.title) return fromDb.title
        return DEFAULT_STATUS_MAP[status]?.title || status
    }

    /** Team picker: any team. */
    const teamOptionsForTicket = useMemo(() => teams || [], [teams])

    const addChecklistItemByTitle = async (
        title: string,
        orderIndex: number,
        options?: { silent?: boolean; groupName?: string | null }
    ) => {
        const trimmed = title.trim()
        if (!trimmed) return null
        const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/checklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: trimmed, order_index: orderIndex, group_name: options?.groupName ?? null }),
        })
        const row = { ...data, order_index: data.order_index ?? orderIndex }
        setChecklistItems((prev) => [...prev, row])
        if (!options?.silent) message.success('Checklist item added')
        return row
    }

    const handleAddChecklistItem = async (groupName?: string | null) => {
        if (!newChecklistTitle.trim()) {
            message.warning('Please enter a checklist item title')
            return
        }
        setLoading(true)
        try {
            const maxOrder =
                checklistItems.length > 0 ? Math.max(...checklistItems.map((item) => item.order_index)) : -1
            await addChecklistItemByTitle(newChecklistTitle, maxOrder + 1, { groupName })
            setNewChecklistTitle('')
        } catch (err: any) {
            message.error(err?.message || 'Failed to add checklist item')
        } finally {
            setLoading(false)
        }
    }

    const loadChecklistItems = async () => {
        try {
            const items = await apiFetch<ChecklistItem[]>(`/api/tickets/${displayTicket.id}/checklist`)
            setChecklistItems(items)
        } catch {
            // silent
        }
    }

    const handleChecklistTemplateApplied = () => {
        void loadChecklistItems()
    }

    const handleAddChecklistItemsBulk = async (titles: string[]) => {
        const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))]
        if (unique.length === 0) return
        setLoading(true)
        try {
            let maxOrder =
                checklistItems.length > 0 ? Math.max(...checklistItems.map((item) => item.order_index)) : -1
            for (const title of unique) {
                maxOrder += 1
                await addChecklistItemByTitle(title, maxOrder, { silent: true })
            }
            message.success(`${unique.length} checklist item(s) added`)
        } catch (err: any) {
            message.error(err?.message || 'Failed to add checklist items')
        } finally {
            setLoading(false)
        }
    }

    const patchChecklistItem = async (
        itemId: string,
        body: { is_completed?: boolean; completion_note?: string; group_name?: string | null }
    ) => {
        const updated = await apiFetch<ChecklistItem>(
            `/api/tickets/${displayTicket.id}/checklist/${itemId}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
        )
        setChecklistItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, ...updated } : item))
        )
    }

    const handleCompleteChecklistItem = async (itemId: string) => {
        try {
            await patchChecklistItem(itemId, { is_completed: true })
        } catch (err: any) {
            message.error(err?.message || 'Failed to complete checklist item')
        }
    }

    const handleUncompleteChecklistItem = async (itemId: string) => {
        try {
            await patchChecklistItem(itemId, { is_completed: false })
        } catch (err: any) {
            message.error(err?.message || 'Failed to update checklist item')
        }
    }

    const handleUpdateChecklistNote = async (itemId: string, completionNote: string) => {
        try {
            await patchChecklistItem(itemId, { completion_note: completionNote })
        } catch (err: any) {
            message.error(err?.message || 'Failed to save note')
        }
    }

    const handleMoveChecklistItemToGroup = async (itemId: string, groupName: string | null) => {
        try {
            await patchChecklistItem(itemId, { group_name: groupName })
            setChecklistItems((prev) =>
                prev.map((item) => (item.id === itemId ? { ...item, group_name: groupName } : item))
            )
        } catch (err: any) {
            message.error(err?.message || 'Failed to move item')
        }
    }

    const handleDeleteGroup = async (groupName: string) => {
        const itemsInGroup = checklistItems.filter((i) => i.group_name === groupName)
        await Promise.all(
            itemsInGroup.map((i) => patchChecklistItem(i.id, { group_name: null }))
        )
        setChecklistItems((prev) =>
            prev.map((i) => i.group_name === groupName ? { ...i, group_name: null } : i)
        )
    }

    const handleDeleteChecklistItem = async (itemId: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/checklist/${itemId}`, { method: 'DELETE' })
            setChecklistItems(checklistItems.filter((item) => item.id !== itemId))
            message.success('Checklist item deleted')
        } catch (err: any) {
            message.error(err?.message || 'Failed to delete checklist item')
        }
    }

    const handleAddComment = async (
        commentText: string,
        attachments: { url: string; file_name: string; file_path: string }[],
        extra?: {
            taggedUserIds?: string[]
            ccEmails?: string[]
            bccEmails?: string[]
            summaryAsNote?: boolean
        }
    ) => {
        if (!commentText.trim() && attachments.length === 0) {
            message.warning('Please enter a comment or attach files')
            return
        }
        if (
            variant === 'admin' &&
            !extra?.summaryAsNote &&
            commentVisibility !== 'note' &&
            commentVisibility !== 'reply'
        ) {
            message.warning('Choose Add note or Reply first')
            return
        }
        setLoading(true)
        try {
            const visibility =
                variant === 'customer' ? 'reply' : extra?.summaryAsNote ? 'note' : commentVisibility
            const author_type = variant === 'customer' ? 'customer' : 'agent'
            const payload: Record<string, unknown> = {
                comment: (commentText || '').trim(),
                visibility,
                author_type,
                attachments: attachments.map((a) => ({ file_url: a.url, file_name: a.file_name, file_path: a.file_path })),
            }
            if (extra?.taggedUserIds?.length) payload.tagged_user_ids = extra.taggedUserIds
            if (extra?.ccEmails?.length) payload.cc_emails = extra.ccEmails
            if (extra?.bccEmails?.length) payload.bcc_emails = extra.bccEmails
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            setComments((prev) =>
              prev.some((c) => c.id === data.id)
                ? prev
                : [...prev, { ...data, comment_attachments: data.comment_attachments || [] }]
            )
            message.success('Comment added')
            if (variant === 'admin' && !extra?.summaryAsNote) setCommentVisibility(null)

            const replyRecipientEmail =
                (typeof displayTicket.contact?.email === 'string' && displayTicket.contact.email.trim()) ||
                (typeof displayTicket.creator?.email === 'string' && displayTicket.creator.email.trim()) ||
                (typeof displayTicket.company?.email === 'string' && displayTicket.company.email.trim()) ||
                ''
            if (variant === 'admin' && visibility === 'reply' && author_type === 'agent' && replyRecipientEmail) {
                try {
                    const res = await fetch('/api/email/send-reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ticketId: displayTicket.id,
                            commentBody: commentText.trim(),
                            ticketTitle: displayTicket.title,
                            toEmail: replyRecipientEmail,
                            ccEmails: extra?.ccEmails ?? [],
                            bccEmails: extra?.bccEmails ?? [],
                            attachments: attachments.map((a) => ({
                                file_url: a.url,
                                file_name: a.file_name,
                                file_path: a.file_path,
                            })),
                        }),
                    })
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        message.warning('Reply saved, but email to the customer failed: ' + (err?.error || res.statusText))
                    }
                } catch {
                    message.warning('Reply saved, but email to the customer failed.')
                }
            }
        } catch (error: any) {
            message.error(error.message || 'Failed to add comment')
        } finally {
            setLoading(false)
        }
    }

    const handleAddAiSummaryComment = async (html: string) => {
        await handleAddComment(html, [], { summaryAsNote: true })
    }

    const handleUpdateComment = async (commentId: string) => {
        if (!editingCommentValue.trim()) {
            message.warning('Please enter a comment')
            return
        }
        setLoading(true)
        try {
            const res = await apiFetch<{ ok: boolean; editedByUserId?: string; editedAt?: string }>(
              `/api/tickets/${displayTicket.id}/comments/${commentId}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: linkifyRichHtml(editingCommentValue.trim()) }),
              }
            )
            const linkedComment = linkifyRichHtml(editingCommentValue.trim())
            const editorUser = res.editedByUserId
              ? (users.find((u: any) => u.id === res.editedByUserId) ?? null)
              : null
            setComments(comments.map((c) =>
              c.id === commentId
                ? {
                    ...c,
                    comment: linkedComment,
                    edited_by_user_id: res.editedByUserId ?? null,
                    edited_at: res.editedAt ?? null,
                    edited_by_user: editorUser
                      ? { id: editorUser.id, full_name: (editorUser as any).full_name ?? null, email: editorUser.email }
                      : null,
                  }
                : c
            ))
            setEditingComment(null)
            setEditingCommentValue('')
            message.success('Comment updated')
        } catch (err: any) {
            message.error(err?.message || 'Failed to update comment')
        } finally {
            setLoading(false)
        }
    }

    const handleRemoveCommentAttachment = async (commentId: string, attachmentId: string) => {
        if (!attachmentId) return
        const key = `${commentId}:${attachmentId}`
        setRemovingCommentAttachmentKey(key)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/comments/${commentId}/attachments/${attachmentId}`, {
                method: 'DELETE',
            })
            setComments((prev) =>
                prev.map((c) =>
                    c.id === commentId
                        ? {
                              ...c,
                              comment_attachments: (c.comment_attachments || []).filter((a) => a.id !== attachmentId),
                          }
                        : c
                )
            )
            message.success('Attachment removed')
        } catch (err: any) {
            message.error(err?.message || 'Failed to remove attachment')
        } finally {
            setRemovingCommentAttachmentKey(null)
        }
    }

    const handleDeleteComment = async (commentId: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/comments/${commentId}`, { method: 'DELETE' })
            setComments(comments.filter((c) => c.id !== commentId))
            message.success('Comment deleted')
        } catch (err: any) {
            message.error(err?.message || 'Failed to delete comment')
        }
    }

    // Check if comment can be deleted (within 1 hour)
    const canDeleteComment = (createdAt: string) => {
        const commentTime = dayjs(createdAt)
        const oneHourAgo = dayjs().subtract(1, 'hour')
        return commentTime.isAfter(oneHourAgo)
    }

    const handleAddAttribute = async () => {
        if (!newAttributeKey.trim()) {
            message.warning('Please enter an attribute key')
            return
        }
        setLoading(true)
        try {
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/attributes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meta_key: newAttributeKey.trim(), meta_value: newAttributeValue.trim() || null }),
            })
            setAttributes([...attributes, data])
            setNewAttributeKey('')
            setNewAttributeValue('')
            message.success('Attribute added')
        } catch (err: any) {
            message.error(err?.message?.includes('exists') ? 'Attribute key already exists' : err?.message || 'Failed to add attribute')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateAttribute = async (attributeId: string, newValue: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/attributes/${attributeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meta_value: newValue.trim() || null }),
            })
            setAttributes(attributes.map((attr) => (attr.id === attributeId ? { ...attr, meta_value: newValue.trim() || null, updated_at: new Date().toISOString() } : attr)))
            setEditingAttribute(null)
            message.success('Attribute updated')
        } catch (err: any) {
            message.error(err?.message || 'Failed to update attribute')
        }
    }

    const handleDeleteAttribute = async (attributeId: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/attributes/${attributeId}`, { method: 'DELETE' })
            setAttributes(attributes.filter((attr) => attr.id !== attributeId))
            message.success('Attribute deleted')
        } catch (err: any) {
            message.error(err?.message || 'Failed to delete attribute')
        }
    }

    const handleUpdateDescription = async () => {
        setLoading(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: linkifyRichHtml(descriptionValue.trim()) || null }),
            })
            setEditingDescription(false)
            message.success('Description updated successfully')
            const linkedDesc = linkifyRichHtml(descriptionValue.trim()) || null
            setDisplayTicket((prev: any) => ({ ...prev, description: linkedDesc }))
        } catch (err: any) {
            message.error(err?.message || 'Failed to update description')
        } finally {
            setLoading(false)
        }
    }

    const handleCancelEditDescription = () => {
        setDescriptionValue(displayTicket.description || '')
        setEditingDescription(false)
    }

    const handleSaveTitle = async () => {
        const t = titleDraft.trim()
        if (!t) {
            message.warning('Please enter a title')
            return
        }
        const cur = typeof displayTicket.title === 'string' ? displayTicket.title.trim() : ''
        if (t === cur) {
            setTitleEditing(false)
            return
        }
        setLoading(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: t }),
            })
            setDisplayTicket((prev: any) => (prev ? { ...prev, title: t } : prev))
            setTitleEditing(false)
            message.success('Title updated')
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update title')
        } finally {
            setLoading(false)
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        setStatusChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            message.success('Status updated')
            const CLOSED_LIKE = new Set(['resolved', 'closed', 'completed', 'cancel', 'archived', 'pending'])
            const priorityCleared = CLOSED_LIKE.has(newStatus.toLowerCase())
            setDisplayTicket((prev: any) => ({ ...prev, status: newStatus, ...(priorityCleared ? { priority: null } : {}) }))
            if (priorityCleared) setSidebarBaselineTick((x) => x + 1)
            bumpActivityRefresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update status')
        } finally {
            setStatusChanging(false)
        }
    }

    const downloadTicketMd = useCallback(() => {
        const t = displayTicket
        if (!t) return
        const htmlToText = (html: string) => {
            const el = document.createElement('div')
            el.innerHTML = html
            return el.innerText ?? el.textContent ?? ''
        }
        const fmt = (d: string) => d ? new Date(d).toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
        const createdBy = t.creator?.full_name || t.creator?.email || '—'
        const company = t.company?.name || '—'
        const team = t.team?.name || '—'
        const agent = t.assignees?.[0]?.user?.full_name || t.assignees?.[0]?.user?.email || '—'
        const lines: string[] = []
        lines.push(`# [#${t.id}] ${t.title ?? ''}`, '')
        lines.push('## Details')
        lines.push('| Field | Value |', '|-------|-------|')
        lines.push(`| Status | ${t.status ?? '—'} |`)
        lines.push(`| Priority | ${t.priority ?? '—'} |`)
        lines.push(`| Source | ${t.source ?? '—'} |`)
        lines.push(`| Type | ${t.ticket_type ?? '—'} |`)
        lines.push(`| Company | ${company} |`)
        lines.push(`| Team | ${team} |`)
        lines.push(`| Agent | ${agent} |`)
        lines.push(`| Created by | ${createdBy} |`)
        lines.push(`| Created at | ${fmt(t.created_at)} |`)
        if (t.due_date) lines.push(`| Due date | ${fmt(t.due_date)} |`)
        lines.push('')
        if (t.description) {
            lines.push('## Description', '', htmlToText(t.description), '')
        }
        if (comments.length > 0) {
            lines.push(`## Comments (${comments.length})`, '')
            for (const c of comments) {
                const author = (c as any).user?.full_name || (c as any).user?.email || 'Unknown'
                const badge = (c as any).visibility === 'note' ? ' `Note`' : (c as any).visibility === 'reply' ? ' `Reply`' : ''
                lines.push(`### ${author}${badge} — ${fmt((c as any).created_at)}`, '')
                lines.push(htmlToText((c as any).comment), '')
            }
        }
        lines.push('---', `*${BRANDING.name} — Ticket #${t.id} — Exported ${new Date().toLocaleString()}*`)
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ticket-${t.id}.md`
        a.click()
        URL.revokeObjectURL(url)
    }, [displayTicket, comments])

    const handleSaveSidebarAttributes = async (d: SidebarAttributesDraft) => {
        const tid = displayTicket?.id
        if (tid == null) return
        if (sidebarSavingRef.current) return
        sidebarSavingRef.current = true

        const useProjectBoard =
            displayTicket?.ticket_type === 'project' &&
            Array.isArray(displayTicket?.project_statuses) &&
            displayTicket.project_statuses.length > 0

        setSidebarAttributesSaving(true)
        try {
            const priorityPayload = ((): number | null => {
              if (d.priority === null || d.priority === undefined) return null
              const n = typeof d.priority === 'number' ? d.priority : Number(d.priority)
              if (!Number.isFinite(n)) return null
              const floored = Math.floor(n)
              return floored > 0 ? floored : null
            })()
            const body: Record<string, unknown> = {
                type_id: d.typeId,
                priority: priorityPayload,
                company_id: d.companyId,
                tag_ids: d.tagIds,
                contact_user_id: d.contactUserId,
                due_date: d.dueDate,
                team_id: d.teamId,
                assignees: d.assigneeIds,
                short_note: d.shortNote.trim() || null,
            }
            if (isAdminOrManager(currentUser.role ?? undefined)) {
                Object.assign(body, ticketPricePayload(d))
            }
            if (useProjectBoard) {
                body.project_status_id = d.projectStatusId
            } else {
                body.status = d.status
            }

            const res = await apiFetch<{
                ticket_cross_company_warning?: string
                company_id?: string | null
                contact_user_id?: string | null
            }>(`/api/tickets/${tid}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            if (res?.ticket_cross_company_warning) {
                message.warning(res.ticket_cross_company_warning)
            }

            setSelectedTagIds(d.tagIds)

            const opts = displayTicket.project_statuses ?? []
            const psRow =
                useProjectBoard && d.projectStatusId != null
                    ? opts.find((s: { id: number }) => s.id === d.projectStatusId)
                    : null

            const fromLists = [...companyCustomers, ...users] as Array<{
                id: string
                full_name?: string | null
                email: string
                avatar_url?: string | null
            }>
            const contactRow = d.contactUserId ? fromLists.find((u) => u.id === d.contactUserId) : null

            const syncedCompanyId =
                res && typeof res === 'object' && 'company_id' in res ? res.company_id : undefined
            const contactClearedByServer =
                res && typeof res === 'object' && 'contact_user_id' in res && res.contact_user_id === null

            setDisplayTicket((prev: any) => {
                if (!prev) return prev
                const nextCompanyId =
                    syncedCompanyId !== undefined ? syncedCompanyId : (d.companyId ?? prev.company_id)
                const nextContactId = contactClearedByServer ? null : d.contactUserId
                const nextContactRow = nextContactId ? fromLists.find((u) => u.id === nextContactId) : null

                return {
                    ...prev,
                    ...(useProjectBoard
                        ? {
                              project_status_id: d.projectStatusId,
                              project_status: psRow
                                  ? {
                                        id: psRow.id,
                                        title: psRow.title,
                                        slug: psRow.slug,
                                        color: psRow.color,
                                    }
                                  : null,
                          }
                        : { status: d.status }),
                    type_id: d.typeId,
                    type: d.typeId != null ? ticketTypes.find((t) => t.id === d.typeId) ?? null : null,
                    priority: priorityPayload,
                    company_id: nextCompanyId,
                    company: nextCompanyId ? companies.find((c) => c.id === nextCompanyId) ?? prev.company : null,
                    contact_user_id: nextContactId,
                    contact: nextContactRow
                        ? {
                              id: nextContactRow.id,
                              full_name: nextContactRow.full_name ?? null,
                              email: nextContactRow.email,
                              avatar_url: nextContactRow.avatar_url ?? null,
                          }
                        : null,
                    due_date: d.dueDate,
                    team_id: d.teamId,
                    short_note: d.shortNote.trim() || null,
                    ...(isAdminOrManager(currentUser.role ?? undefined)
                        ? ticketPricePayload(d)
                        : {}),
                    assignees: d.assigneeIds.map((uid) => {
                        const u = fromLists.find((x) => x.id === uid)
                        return {
                            id: uid,
                            user_id: uid,
                            user: u ? { id: u.id, full_name: u.full_name ?? null, email: u.email, avatar_url: u.avatar_url ?? null } : null,
                        }
                    }),
                }
            })

            setSidebarBaselineTick((x) => x + 1)
            message.success('Ticket attributes saved')
            bumpActivityRefresh()
            router.refresh()
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : 'Failed to save ticket attributes')
        } finally {
            setSidebarAttributesSaving(false)
            sidebarSavingRef.current = false
        }
    }

    const handleSaveCustomerChanges = async (changes: { type_id?: number | null; priority?: number | null }) => {
        setCustomerChangesSaving(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changes),
            })
            message.success('Changes saved')
            setDisplayTicket((prev: any) => ({
                ...prev,
                ...(changes.type_id !== undefined && {
                    type_id: changes.type_id,
                    type: changes.type_id != null ? ticketTypes.find((t) => t.id === changes.type_id) ?? null : null,
                }),
                ...(changes.priority !== undefined && { priority: changes.priority }),
            }))
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to save changes')
        } finally {
            setCustomerChangesSaving(false)
        }
    }

    useEffect(() => {
        if (!displayTicket?.id) return
        const fetchDescAttachments = async () => {
            try {
                const data = await apiFetch<Array<{ id: string; file_url: string; file_name: string; file_path?: string }>>(`/api/tickets/${displayTicket.id}/attachments`)
                setDescriptionAttachmentsFromDb((data || []).map((a) => ({ ...a, file_path: a.file_path ?? '' })))
            } catch {
                setDescriptionAttachmentsFromDb([])
            }
        }
        fetchDescAttachments()
    }, [displayTicket?.id])

    const handleDescriptionFilesSelected = async (files: FileList | null) => {
        if (!files?.length || !displayTicket?.id) return
        setLoading(true)
        try {
            const companyName = displayTicket?.company?.name ?? 'unknown'
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const result = await uploadTicketFile(file, displayTicket.id, 'attachments', companyName)
                if (result.url && result.path) {
                    setNewDescriptionAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
                } else if (result.error) {
                    message.error(`${file.name}: ${result.error}`)
                }
            }
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateTicket = async (values: any) => {
        setLoading(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: values.title,
                    description: values.description || null,
                    status: values.status,
                    type_id: values.type_id ?? null,
                    company_id: variant !== 'customer' ? values.company_id ?? null : undefined,
                    due_date: values.due_date ? values.due_date.toISOString() : null,
                    tag_ids: variant !== 'customer' ? selectedTagIds : undefined,
                    attachments_add: newDescriptionAttachments.map((a) => ({ file_url: a.url, file_name: a.file_name, file_path: a.file_path })),
                    attachments_delete: deletedDescriptionAttachmentIds,
                }),
            })
            setNewDescriptionAttachments([])
            setDeletedDescriptionAttachmentIds([])
            const refreshed = await apiFetch<Array<{ id: string; file_url: string; file_name: string; file_path?: string }>>(`/api/tickets/${displayTicket.id}/attachments`)
            setDescriptionAttachmentsFromDb((refreshed || []).map((a) => ({ ...a, file_path: a.file_path ?? '' })))

            message.success('Ticket updated successfully')
            setEditModalVisible(false)

            // Reload page to get updated data
            router.refresh()
        } catch (error: any) {
            message.error(error.message || 'Failed to update ticket')
        } finally {
            setLoading(false)
        }
    }

    const completedChecklistCount = checklistItems.filter((item) => item.is_completed).length
    const totalChecklistCount = checklistItems.length
    const isCustomer = variant === 'customer'
    const isTicketAdmin = isAdmin((currentUser as { role?: string }).role)
    const canAdjustReportedDuration = isAdminOrManager((currentUser as { role?: string }).role)
    const canMoveTicketToTrash = canDeleteTickets((currentUser as { role?: string }).role)
    const rowTicketType = (displayTicket?.ticket_type as string | undefined) ?? 'support'

    const patchTicketClassification = useCallback(
        async (ticket_type: 'support' | 'spam' | 'trash' | 'notification') => {
            const tid = displayTicket?.id
            if (tid == null) return
            setClassifyLoading(ticket_type)
            try {
                await apiFetch(`/api/tickets/${tid}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticket_type }),
                })
                setDisplayTicket((d: typeof displayTicket) => (d ? { ...d, ticket_type } : d))
                message.success(
                    ticket_type === 'support'
                        ? 'Marked as support'
                        : ticket_type === 'spam'
                          ? 'Marked as spam'
                          : ticket_type === 'notification'
                            ? 'Moved to notifications'
                            : 'Marked as trash',
                )
                router.refresh()
            } catch (e: unknown) {
                message.error(e instanceof Error ? e.message : 'Failed to update classification')
            } finally {
                setClassifyLoading(null)
            }
        },
        [displayTicket?.id, router],
    )

    /** Email tickets: stop importing mail from this sender (address or whole domain), then trash the ticket */
    const senderEmail: string | null =
        displayTicket?.created_via === 'email' && typeof displayTicket?.creator?.email === 'string'
            ? displayTicket.creator.email.trim().toLowerCase() || null
            : null
    const [ignoringSender, setIgnoringSender] = useState(false)
    const ignoreSender = useCallback(
        async (entry: string) => {
            setIgnoringSender(true)
            try {
                const res = await fetch('/api/email/skip-list', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: entry, reason: `From ticket #${displayTicket?.id}` }),
                })
                const data = await res.json().catch(() => ({}))
                // Already ignored is fine: continue with trashing
                if (!res.ok && res.status !== 409) throw new Error(data.error || 'Could not ignore sender')
                message.success(`Mail from ${entry} will no longer create tickets`)
                if (canMoveTicketToTrash && rowTicketType !== 'trash') await patchTicketClassification('trash')
            } catch (e) {
                message.error(e instanceof Error ? e.message : 'Could not ignore sender')
            } finally {
                setIgnoringSender(false)
            }
        },
        [displayTicket?.id, canMoveTicketToTrash, rowTicketType, patchTicketClassification],
    )

    type MyOpenTicketNavDirection = 'next' | 'prev'

    const navigateMyOpenTicket = useCallback(
        async (direction: MyOpenTicketNavDirection) => {
            const tid = displayTicket?.id
            if (tid == null) return
            setNextTicketNavLoading(true)
            try {
                type TicketListRow = {
                    id: number
                    created_at: string
                    updated_at: string
                    status: string
                    created_by: string
                    ticket_type?: string
                }
                const list = await apiFetch<TicketListRow[]>('/api/tickets?limit=200')
                const uid = currentUser.id
                const openMine = list.filter(
                    (t) =>
                        t.created_by === uid &&
                        String(t.status || '').toLowerCase() !== 'closed' &&
                        (t.ticket_type ?? 'support') === 'support',
                )
                /** Same default as ticket list: newest activity first (`sortTickets` updated_at desc). */
                const ordered = [...openMine].sort((a, b) => {
                    const tu = new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime()
                    if (tu !== 0) return -tu
                    return b.id - a.id
                })
                if (ordered.length === 0) {
                    message.info('You have no open tickets.')
                    return
                }
                const idx = ordered.findIndex((t) => t.id === tid)
                let targetId: number | null = null

                if (direction === 'next') {
                    if (idx >= 0 && idx < ordered.length - 1) {
                        targetId = ordered[idx + 1]!.id
                    } else if (idx >= 0 && idx === ordered.length - 1) {
                        message.info('You are already on the last ticket in the list (oldest activity in this view).')
                        return
                    } else {
                        const candidate = ordered.find((t) => t.id !== tid) ?? ordered[0]
                        targetId = candidate.id === tid ? null : candidate.id
                        if (targetId == null) {
                            message.info('No other open tickets.')
                            return
                        }
                    }
                } else {
                    if (idx > 0) {
                        targetId = ordered[idx - 1]!.id
                    } else if (idx === 0) {
                        message.info('You are already on the first ticket in the list (most recently updated).')
                        return
                    } else {
                        for (let i = ordered.length - 1; i >= 0; i--) {
                            if (ordered[i]!.id !== tid) {
                                targetId = ordered[i]!.id
                                break
                            }
                        }
                        if (targetId == null) {
                            message.info('No other open tickets.')
                            return
                        }
                    }
                }

                router.push(`/tickets/${targetId}`)
            } catch (e: unknown) {
                message.error(e instanceof Error ? e.message : 'Failed to load tickets')
            } finally {
                setNextTicketNavLoading(false)
            }
        },
        [currentUser.id, displayTicket?.id, router],
    )

    const timeTrackerManualUserOptions = useMemo(
        () =>
            users
                .filter((u: { role?: string }) => (u?.role ?? '').toLowerCase() !== 'customer')
                .map((u: { id: string; full_name?: string | null; email?: string | null }) => ({
                    value: String(u.id),
                    label: String(u.full_name || u.email || u.id),
                })),
        [users],
    )

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
            <AdminMainColumn collapsed={collapsed} user={currentUser}>
                <Content style={{ padding: '0', background: 'var(--layout-bg)', minHeight: 'calc(100vh - 56px)' }}>
                    <div className="ticket-header-bar" style={{
                        position: 'sticky',
                        top: isMobile ? 0 : 80,
                        zIndex: 99,
                        background: 'var(--ticket-nav-bg)',
                        border: '1px solid var(--ticket-nav-border)',
                        borderRadius: isMobile ? 0 : '16px 16px 0 0',
                        padding: isMobile ? '8px 12px' : '12px 20px',
                        margin: isMobile ? 0 : '12px 24px 0 24px',
                        marginRight: isMobile ? 0 : 'calc(var(--attr-sidebar-width, 0px) + 24px)',
                        transition: 'margin-right 0.2s',
                    }}>
                        <Flex gap={16} align="center" wrap="wrap">
                            <BackLink
                                onClick={() => {
                                    if (isTicketFolder(rowTicketType)) window.location.href = `/tickets?ticket_type=${rowTicketType}`
                                    else window.location.href = '/tickets'
                                }}
                            >
                                {isCustomer ? 'Portal' : isTicketFolder(rowTicketType) ? TICKET_FOLDER_LABELS[rowTicketType] : 'Tickets'}
                            </BackLink>
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 240,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        flex: '1 1 200px',
                                        minWidth: 0,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <Title
                                        level={4}
                                        style={{
                                            margin: 0,
                                            flex: '1 1 160px',
                                            minWidth: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                        }}
                                    >
                                        <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                                            {!isCustomer && titleEditing ? (
                                                <Flex gap={8} align="center" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                                                    <Text type="secondary" style={{ flexShrink: 0 }}>
                                                        #{displayTicket.id}
                                                    </Text>
                                                    <Input
                                                        value={titleDraft}
                                                        onChange={(e) => setTitleDraft(e.target.value)}
                                                        onPressEnter={() => void handleSaveTitle()}
                                                        style={{ minWidth: isMobile ? 0 : 300, flex: '1 1 120px', maxWidth: 560 }}
                                                        disabled={loading}
                                                        aria-label="Ticket title"
                                                    />
                                                    <Button
                                                        type="primary"
                                                        loading={loading}
                                                        onClick={() => void handleSaveTitle()}
                                                    >
                                                        {loading ? 'Saving…' : 'Save'}
                                                    </Button>
                                                    <Button
                                                        onClick={() => {
                                                            setTitleDraft(
                                                                typeof displayTicket.title === 'string'
                                                                    ? displayTicket.title
                                                                    : '',
                                                            )
                                                            setTitleEditing(false)
                                                        }}
                                                        disabled={loading}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </Flex>
                                            ) : (
                                                <TitleDisplay
                                                    id={displayTicket.id}
                                                    title={typeof displayTicket.title === 'string' ? displayTicket.title : ''}
                                                />
                                            )}
                                        </span>
                                    </Title>
                                    {displayTicket.project?.id ? (
                                        <Tag icon={<FolderOutlined />}>{displayTicket.project.title}</Tag>
                                    ) : null}
                                    {isCustomer && (
                                        <Flex gap={8} wrap="wrap" align="center">
                                            <Button
                                                icon={<LeftOutlined />}
                                                loading={nextTicketNavLoading}
                                                onClick={() => void navigateMyOpenTicket('prev')}
                                            >
                                                Prev ticket
                                            </Button>
                                            <Button
                                                icon={<RightOutlined />}
                                                type="primary"
                                                loading={nextTicketNavLoading}
                                                onClick={() => void navigateMyOpenTicket('next')}
                                            >
                                                Next ticket
                                            </Button>
                                        </Flex>
                                    )}
                                    {!isCustomer && (
                                        <div
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: 8,
                                            }}
                                        >
                                            {!titleEditing && (
                                                <Tooltip title="Edit title">
                                                    <Button
                                                        icon={<EditOutlined />}
                                                        onClick={() => {
                                                            setTitleDraft(
                                                                typeof displayTicket.title === 'string'
                                                                    ? displayTicket.title
                                                                    : '',
                                                            )
                                                            setTitleEditing(true)
                                                        }}
                                                        aria-label="Edit title"
                                                    />
                                                </Tooltip>
                                            )}
                                            <Tooltip title="Download as Markdown">
                                                <Button icon={<FileMarkdownOutlined />} onClick={downloadTicketMd} />
                                            </Tooltip>
                                            <Tooltip title="Print ticket">
                                                <Button
                                                    icon={<PrinterOutlined />}
                                                    onClick={() => window.open(`/tickets/${displayTicket.id}/print`, '_blank')}
                                                />
                                            </Tooltip>
                                            {rowTicketType !== 'support' && (
                                                <Tag color={rowTicketType === 'spam' ? 'red' : rowTicketType === 'notification' ? 'cyan' : 'orange'}>
                                                    {rowTicketType === 'spam' ? 'Spam ticket' : rowTicketType === 'notification' ? 'Notification' : 'Trash ticket'}
                                                </Tag>
                                            )}
                                            { rowTicketType !=='spam'&&(
                                                <Button
                                                icon={<WarningOutlined />}
                                                danger={rowTicketType !== 'spam'}
                                                type={rowTicketType === 'spam' ? 'primary' : 'default'}
                                                loading={classifyLoading === 'spam'}
                                                disabled={classifyLoading !== null && classifyLoading !== 'spam'}
                                                onClick={() => void patchTicketClassification('spam')}
                                            >
                                                Spam
                                            </Button>
                                            ) }
                                            
                                            {!isCustomer && senderEmail ? (
                                                <Dropdown
                                                    trigger={['click']}
                                                    menu={{
                                                        items: [
                                                            { key: 'address', label: `Ignore ${senderEmail}` },
                                                            ...(senderEmail.includes('@')
                                                                ? [{ key: 'domain', label: `Ignore everything from @${senderEmail.split('@').pop()}` }]
                                                                : []),
                                                        ],
                                                        onClick: ({ key }) =>
                                                            void ignoreSender(key === 'domain' ? `@${senderEmail.split('@').pop()}` : senderEmail),
                                                    }}
                                                >
                                                    <Tooltip title={canMoveTicketToTrash ? 'Stop creating tickets from this sender and move this one to Trash' : 'Stop creating tickets from this sender'}>
                                                        <Button icon={<StopOutlined />} loading={ignoringSender}>
                                                            Ignore sender
                                                        </Button>
                                                    </Tooltip>
                                                </Dropdown>
                                            ) : null}
                                            {canMoveTicketToTrash && rowTicketType !== 'trash' && (
                                            <Button
                                            
                                                icon={<DeleteOutlined />}
                                                type='primary'
                                                danger
                                                loading={classifyLoading === 'trash'}
                                                disabled={classifyLoading !== null && classifyLoading !== 'trash'}
                                                onClick={() => void patchTicketClassification('trash')}
                                            >
                                                Trash
                                            </Button>
                                            )}
                                            {!isMobile && (
                                                <span className="ticket-panel-toggles">
                                                    <Tooltip title={attrSidebarCollapsed ? 'Show attributes' : 'Hide attributes'}>
                                                        <Button
                                                            icon={<ProfileOutlined />}
                                                            type={attrSidebarCollapsed ? 'default' : 'primary'}
                                                            onClick={() => setAttrSidebarCollapsed(!attrSidebarCollapsed)}
                                                            aria-pressed={!attrSidebarCollapsed}
                                                        >
                                                            Attributes
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip title={companySidebarCollapsed ? 'Show company info' : 'Hide company info'}>
                                                        <Button
                                                            icon={<BankOutlined />}
                                                            type={companySidebarCollapsed ? 'default' : 'primary'}
                                                            onClick={() => setCompanySidebarCollapsed(!companySidebarCollapsed)}
                                                            aria-pressed={!companySidebarCollapsed}
                                                            aria-label="Company info"
                                                        />
                                                    </Tooltip>
                                                </span>
                                            )}
                                            
                                            {rowTicketType !== 'support' && (
                                                <Button
                                                    type="primary"
                                                    loading={classifyLoading === 'support'}
                                                    disabled={
                                                        classifyLoading !== null && classifyLoading !== 'support'
                                                    }
                                                    onClick={() => void patchTicketClassification('support')}
                                                >
                                                    Mark as support
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <TicketPresenceBar
                                    ticketId={displayTicket.id}
                                    currentUser={{
                                        id: currentUser.id,
                                        name: currentUser.name,
                                        image: currentUser.image,
                                    }}
                                />
                            </div>
                        </Flex>
                    </div>
                    <div style={{ padding: isMobile ? '12px' : '0 24px 24px', paddingRight: isMobile ? '12px' : 'calc(var(--attr-sidebar-width, 0px) + 24px)', transition: 'padding-right 0.2s' }}>
                    <Card
                        style={{
                            margin: '0 auto',
                            ...(isMobile
                                ? {}
                                : { borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }),
                        }}
                    >

                        {isCustomer ? (
                            <TabGeneralCustomer
                                ticketData={displayTicket}
                                ticketAttachments={descriptionAttachmentsFromDb}
                                statusOptions={allStatusesForSelect}
                                onStatusChange={handleStatusChange}
                                statusChanging={statusChanging}
                                typeOptions={ticketTypes}
                                onSaveChanges={handleSaveCustomerChanges}
                                savingChanges={customerChangesSaving}
                                totalTimeSeconds={totalTimeSeconds}
                                activeTimeTracker={activeTimeTracker}
                                formatTime={formatTime}
                                comments={comments}
                                currentUserId={currentUser.id}
                                editingComment={editingComment}
                                editingCommentValue={editingCommentValue}
                                onEditComment={(id, value) => {
                                    setEditingComment(id)
                                    setEditingCommentValue(value)
                                }}
                                onEditingCommentValueChange={setEditingCommentValue}
                                onSaveEditComment={handleUpdateComment}
                                onCancelEditComment={() => {
                                    setEditingComment(null)
                                    setEditingCommentValue('')
                                }}
                                onDeleteComment={handleDeleteComment}
                                canDeleteComment={canDeleteComment}
                                onRemoveCommentAttachment={handleRemoveCommentAttachment}
                                removingCommentAttachmentKey={removingCommentAttachmentKey}
                                onAddComment={handleAddComment}
                                addCommentLoading={loading}
                                commentsHasOlder={commentsHasOlder}
                                commentsOlderRemaining={commentsOlderRemaining}
                                onLoadMoreComments={handleLoadMoreComments}
                                loadMoreCommentsLoading={loadingMoreComments}
                                companyCustomers={companyCustomers}
                                ticketCcEmails={ticketCcEmailsState}
                            />
                        ) : (
                        <Tabs
                            defaultActiveKey="general"
                            items={[
                                {
                                    key: 'general',
                                    label: 'General Info',
                                    children: (
                                        <TabGeneral
                                            ticketData={displayTicket}
                                            ticketAttachments={descriptionAttachmentsFromDb}
                                            statusOptions={allStatusesForSelect}
                                            projectStatusOptions={
                                                displayTicket?.ticket_type === 'project' &&
                                                Array.isArray(displayTicket?.project_statuses) &&
                                                displayTicket.project_statuses.length > 0
                                                    ? displayTicket.project_statuses.map(
                                                          (s: {
                                                              id: number
                                                              title: string
                                                              slug: string
                                                              color: string
                                                          }) => ({
                                                              id: s.id,
                                                              title: s.title,
                                                              slug: s.slug,
                                                              color: s.color,
                                                          }),
                                                      )
                                                    : undefined
                                            }
                                            typeOptions={ticketTypes}
                                            companyOptions={companies}
                                            contactUserOptions={contactUserOptionsForTicket}
                                            selectedContactUserId={displayTicket.contact_user_id ?? null}
                                            tagOptions={allTags}
                                            selectedTagIds={selectedTagIds}
                                            canEditCompanyAndTags
                                            canEditBilling={isAdminOrManager(currentUser.role ?? undefined)}
                                            teamOptions={teamOptionsForTicket}
                                            selectedTeamId={displayTicket.team_id ?? null}
                                            canEditAssignees
                                            sidebarBaselineTick={sidebarBaselineTick}
                                            sidebarAttributesSaving={sidebarAttributesSaving}
                                            onSaveSidebarAttributes={handleSaveSidebarAttributes}
                                            totalTimeSeconds={totalTimeSeconds}
                                            activeTimeTracker={activeTimeTracker}
                                            formatTime={formatTime}
                                            comments={comments}
                                            currentUserId={currentUser.id}
                                            editingComment={editingComment}
                                            editingCommentValue={editingCommentValue}
                                            onEditComment={(id, value) => {
                                                setEditingComment(id)
                                                setEditingCommentValue(value)
                                            }}
                                            onEditingCommentValueChange={setEditingCommentValue}
                                            onSaveEditComment={handleUpdateComment}
                                            onCancelEditComment={() => {
                                                setEditingComment(null)
                                                setEditingCommentValue('')
                                            }}
                                            onDeleteComment={handleDeleteComment}
                                            canDeleteComment={canDeleteComment}
                                            onRemoveCommentAttachment={handleRemoveCommentAttachment}
                                            removingCommentAttachmentKey={removingCommentAttachmentKey}
                                            onAddComment={handleAddComment}
                                            onAddChecklistItemsBulk={handleAddChecklistItemsBulk}
                                            onAddAiSummaryComment={handleAddAiSummaryComment}
                                            addCommentLoading={loading}
                                            commentsHasOlder={commentsHasOlder}
                                            commentsOlderRemaining={commentsOlderRemaining}
                                            onLoadMoreComments={handleLoadMoreComments}
                                            loadMoreCommentsLoading={loadingMoreComments}
                                            ticketCcEmails={ticketCcEmailsState}
                                            commentVisibility={commentVisibility}
                                            onCommentVisibilityChange={setCommentVisibility}
                                            showNoteOption
                                            currentUserRole={currentUser.role}
                                            nonCustomerUsers={users.filter((u: any) => (u?.role ?? '')?.toLowerCase() !== 'customer')}
                                            companyCustomers={companyCustomers}
                                            attributes={attributes}
                                            newAttributeKey={newAttributeKey}
                                            newAttributeValue={newAttributeValue}
                                            onNewAttributeKeyChange={setNewAttributeKey}
                                            onNewAttributeValueChange={setNewAttributeValue}
                                            onAddAttribute={handleAddAttribute}
                                            editingAttribute={editingAttribute}
                                            onEditingAttributeChange={setEditingAttribute}
                                            onUpdateAttribute={handleUpdateAttribute}
                                            onDeleteAttribute={handleDeleteAttribute}
                                            attributesLoading={loading}
                                            canEditTicketDescription
                                            ticketDescriptionDraft={descriptionValue}
                                            onTicketDescriptionDraftChange={(html) =>
                                                setDescriptionValue(html ?? '')
                                            }
                                            ticketDescriptionEditing={editingDescription}
                                            onTicketDescriptionEditingStart={() => {
                                                setDescriptionValue(
                                                    typeof displayTicket.description === 'string'
                                                        ? displayTicket.description
                                                        : '',
                                                )
                                                setEditingDescription(true)
                                            }}
                                            onTicketDescriptionEditingCancel={handleCancelEditDescription}
                                            onTicketDescriptionSave={() => void handleUpdateDescription()}
                                            ticketDescriptionSaving={loading}
                                            onApplyAiSummaryToDescription={async (html) => {
                                                setDescriptionValue(html)
                                                setEditingDescription(true)
                                            }}
                                            aiConfigured={aiConfigured}
                                            rightCollapsed={attrSidebarCollapsed}
                                            onRightCollapsedChange={setAttrSidebarCollapsed}
                                            companyCollapsed={companySidebarCollapsed}
                                            onCompanyCollapsedChange={setCompanySidebarCollapsed}
                                        />
                                    ),
                                },
                                {
                                    key: 'checklist',
                                    label:
                                        totalChecklistCount > 0
                                            ? `Checklist (${completedChecklistCount}/${totalChecklistCount})`
                                            : 'Checklist',
                                    children: (
                                        <TabChecklist
                                            ticketId={displayTicket.id}
                                            checklistItems={checklistItems}
                                            totalChecklistCount={totalChecklistCount}
                                            completedChecklistCount={completedChecklistCount}
                                            newChecklistTitle={newChecklistTitle}
                                            onNewChecklistTitleChange={setNewChecklistTitle}
                                            onAddChecklistItem={handleAddChecklistItem}
                                            onCompleteChecklistItem={handleCompleteChecklistItem}
                                            onUncompleteChecklistItem={handleUncompleteChecklistItem}
                                            onUpdateChecklistNote={handleUpdateChecklistNote}
                                            onDeleteChecklistItem={handleDeleteChecklistItem}
                                            onMoveToGroup={handleMoveChecklistItemToGroup}
                                            onDeleteGroup={handleDeleteGroup}
                                            onTemplateApplied={handleChecklistTemplateApplied}
                                        />
                                    ),
                                },
                                {
                                    key: 'time-tracker',
                                    label: 'Time Tracker',
                                    children: (
                                        <TabTimeTracker
                                            ticketData={displayTicket}
                                            totalTimeSeconds={totalTimeSeconds}
                                            activeTimeTracker={activeTimeTracker}
                                            formatTime={formatTime}
                                            timeTrackerSessions={timeTrackerSessions}
                                            timeTrackerLoading={loading}
                                            onStartTimeTracker={handleStartTimeTracker}
                                            onStopTimeTracker={handleStopTimeTracker}
                                            currentUserId={currentUser.id}
                                            onTimeTrackingChanged={refreshTimeTracking}
                                            canManageOthersTime={isTicketAdmin}
                                            manualUserOptions={timeTrackerManualUserOptions}
                                            canAdjustReportedDuration={canAdjustReportedDuration}
                                            canAdjustStartStop={canAdjustReportedDuration}
                                            canAddManual={canAdjustReportedDuration}
                                        />
                                    ),
                                },
                                {
                                    key: 'activity',
                                    label: 'Activity log',
                                    children: (
                                        <TabActivity
                                            ticketId={displayTicket.id}
                                            refreshKey={activityRefreshKey}
                                        />
                                    ),
                                },
                                // {
                                //     key: 'screenshots',
                                //     label: `Screenshots (${screenshots.length})`,
                                //     children: <TabScreenshots screenshots={screenshots} />,
                                // },
                            ]}
                        />
                        )}
                    </Card>
                    </div>
                </Content>
            </AdminMainColumn>
        </Layout>
    )
}
