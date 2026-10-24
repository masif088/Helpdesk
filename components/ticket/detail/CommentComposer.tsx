'use client'

import {
  CommentOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { Button, Flex, Input, message, Modal, Popover, Select } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import { linkifyRichHtml } from '@/lib/linkify-rich-html'
import { uploadTicketFile } from '@/utils/storage'

import CommentWysiwyg from './CommentWysiwyg'

type CannedItem = { id: string; title: string; shortcut: string; content: string; scope: string }

const cannedPreview = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
    .slice(0, 110)

export type CommentExtra = {
  taggedUserIds?: string[]
  ccEmails?: string[]
  bccEmails?: string[]
  /** AI summary posts as internal note (agent UI). */
  summaryAsNote?: boolean
}

interface NonCustomerUser {
  id: string
  full_name?: string | null
  email: string
}

interface CommentComposerProps {
  ticketId: number
  companyName: string
  onAddComment: (
    commentText: string,
    attachments: { url: string; file_name: string; file_path: string }[],
    extra?: CommentExtra
  ) => Promise<void>
  loading?: boolean
  /** When `showNoteOption`, `null` = pick mode first (Add note / Reply buttons only). */
  commentVisibility?: 'note' | 'reply' | null
  onCommentVisibilityChange?: (v: 'note' | 'reply') => void
  showNoteOption?: boolean
  /** Non-customer users for tagging in notes (role !== 'customer') */
  nonCustomerUsers?: NonCustomerUser[]
  /** Company customers for CC/BCC preselect (users in ticket's company) */
  companyCustomers?: Array<{ id: string; full_name: string | null; email: string }>
  /** Emails ever CC'd on this ticket - pre-fill CC for auto-CC on replies */
  ticketCcEmails?: string[]
  /** Portal customer: hide CC/BCC (no outbound copy). */
  showReplyCcBcc?: boolean
  /** Optional cancel callback — shows a Cancel button next to Submit. */
  onCancel?: () => void
}

export default function CommentComposer({
  ticketId,
  companyName,
  onAddComment,
  loading = false,
  commentVisibility,
  onCommentVisibilityChange,
  showNoteOption = false,
  nonCustomerUsers = [],
  companyCustomers = [],
  ticketCcEmails = [],
  showReplyCcBcc = true,
  onCancel,
}: CommentComposerProps) {
  const isBlankEditorValue = (value: string): boolean => {
    const textOnly = String(value || '')
      .replace(/<p><br><\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
    return textOnly.length === 0
  }

  /** Customer / non-agent UI: always reply. Agent with note+reply: honor null = choose mode first. */
  const mode = showNoteOption ? commentVisibility ?? null : 'reply'

  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>(() => {
    if (!showReplyCcBcc) return []
    const emails = (ticketCcEmails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => e && e.includes('@'))
    return emails
  })
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const isReplyMode = (showNoteOption && mode === 'reply') || !showNoteOption

  // Canned responses (agents only): loaded the first time the picker opens, filtered as the agent types
  const [cannedOpen, setCannedOpen] = useState(false)
  const [canned, setCanned] = useState<CannedItem[] | null>(null)
  const [cannedQuery, setCannedQuery] = useState('')
  const [cannedBusy, setCannedBusy] = useState(false)
  const openCanned = async (open: boolean) => {
    setCannedOpen(open)
    if (!open || canned) return
    try {
      const res = await fetch('/api/canned-responses', { credentials: 'include', cache: 'no-store' })
      setCanned(res.ok ? await res.json() : [])
    } catch {
      setCanned([])
    }
  }
  const insertCanned = async (item: CannedItem) => {
    setCannedBusy(true)
    try {
      const res = await fetch(`/api/canned-responses/${item.id}/use`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      const data = (await res.json().catch(() => ({}))) as { html?: string; error?: string }
      if (!res.ok || !data.html) throw new Error(data.error || 'Could not insert the reply')
      const html = data.html
      // an empty box takes the reply as it is; otherwise it goes under what was already written
      setDraft((prev) => (isBlankEditorValue(prev) ? html : `${prev}${html}`))
      setCannedOpen(false)
      setCannedQuery('')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setCannedBusy(false)
    }
  }
  const cannedShown = (canned ?? []).filter((c) => {
    const q = cannedQuery.trim().toLowerCase().replace(/^\//, '')
    return !q || `${c.title} ${c.shortcut} ${cannedPreview(c.content)}`.toLowerCase().includes(q)
  })

  useEffect(() => {
    if (isBlankEditorValue(draft) && attachments.length === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [draft, attachments])

  /** One fetch per ticket per "reply session"; reset after successful send or ticket change. */
  const agentReplyTemplateConsumedRef = useRef(false)
  const agentReplyTemplateHtmlRef = useRef('')
  const agentReplyTemplateLoadingRef = useRef(false)

  const applyTemplateIfPossible = (html: string) => {
    if (!html.trim()) return
    if (agentReplyTemplateConsumedRef.current) return
    if (!isReplyMode) return
    setDraft((prev) => {
      if (!isBlankEditorValue(prev)) return prev
      agentReplyTemplateConsumedRef.current = true
      return html
    })
  }

  const fetchAgentReplyTemplate = async () => {
    if (agentReplyTemplateLoadingRef.current) return
    agentReplyTemplateLoadingRef.current = true
    try {
      const res = await fetch(`/api/tickets/${ticketId}/agent-reply-template`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { html?: string }
      const html = typeof data.html === 'string' ? data.html.trim() : ''
      agentReplyTemplateHtmlRef.current = html
      applyTemplateIfPossible(html)
    } catch {
      // optional prefill, ignore network/auth errors
    } finally {
      agentReplyTemplateLoadingRef.current = false
    }
  }

  useEffect(() => {
    agentReplyTemplateConsumedRef.current = false
    agentReplyTemplateHtmlRef.current = ''
    void fetchAgentReplyTemplate()
  }, [ticketId])

  useEffect(() => {
    if (!isReplyMode) return
    if (agentReplyTemplateHtmlRef.current) {
      applyTemplateIfPossible(agentReplyTemplateHtmlRef.current)
      return
    }
    void fetchAgentReplyTemplate()
  }, [isReplyMode, ticketId])

  const baseCcOptions = companyCustomers
    .filter((u) => u.email?.trim())
    .map((u) => ({
      value: u.email.trim().toLowerCase(),
      label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
    }))
  const ticketCcSet = new Set((ticketCcEmails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => e && e.includes('@')))
  const ticketCcOnlyOptions = [...ticketCcSet]
    .filter((e) => !baseCcOptions.some((o) => o.value === e))
    .map((e) => ({ value: e, label: e }))
  const ccOptions = [...baseCcOptions, ...ticketCcOnlyOptions]

  const tagAgentOptions = useMemo(
    () =>
      nonCustomerUsers.map((u) => ({
        value: u.id,
        label: u.full_name ? `${u.full_name} (${u.email})` : u.email || u.id,
      })),
    [nonCustomerUsers]
  )

  const filterTagAgents = (input: string, option?: { value?: string; label?: unknown }) => {
    if (!input.trim()) return true
    const id = option?.value
    if (!id || typeof id !== 'string') return false
    const u = nonCustomerUsers.find((x) => x.id === id)
    if (!u) return false
    const q = input.trim().toLowerCase()
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    )
  }

  const handleSubmit = async () => {
    if (showNoteOption && mode == null) return
    if (!draft.trim() && attachments.length === 0) return
    try {
      const extra: CommentExtra = {}
      if (showNoteOption && mode === 'note' && taggedUserIds.length > 0) {
        extra.taggedUserIds = taggedUserIds
      }
      if (showReplyCcBcc && isReplyMode) {
        const cc = ccEmails.filter((e) => e?.trim() && e.includes('@'))
        const bcc = bccEmails.filter((e) => e?.trim() && e.includes('@'))
        if (cc.length > 0) extra.ccEmails = cc
        if (bcc.length > 0) extra.bccEmails = bcc
      }
      await onAddComment(linkifyRichHtml(draft.trim()), attachments, Object.keys(extra).length > 0 ? extra : undefined)
      setDraft('')
      setAttachments([])
      setTaggedUserIds([])
      setCcEmails([])
      setBccEmails([])
      agentReplyTemplateConsumedRef.current = false
    } catch {
      // Error already shown by parent
    }
  }

  const handleFilesSelected = async (files: File[] | FileList | null) => {
    const arr = files ? Array.from(files) : []
    if (!arr.length) return
    setUploading(true)
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const result = await uploadTicketFile(file, ticketId, 'comments', companyName)
        if (result.url && result.path) {
          setAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
        } else if (result.error) {
          message.error(`${file.name}: ${result.error}`)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  const placeholder = showNoteOption
    ? mode === 'note'
      ? 'Add a note (agent only)...'
      : 'Reply (visible to client)...'
    : 'Add a comment...'

  const handleModeChange = (next: 'note' | 'reply') => {
    if (!onCommentVisibilityChange) return
    if (mode === next) return

    const switchMode = () => {
      setAttachments([])
      setTaggedUserIds([])
      if (next === 'reply') {
        agentReplyTemplateConsumedRef.current = false
        const html = agentReplyTemplateHtmlRef.current.trim()
        if (html) {
          agentReplyTemplateConsumedRef.current = true
          setDraft(html)
        } else {
          setDraft('')
          void fetchAgentReplyTemplate()
        }
      } else {
        setDraft('')
      }
      onCommentVisibilityChange(next)
    }

    const hasContent = !isBlankEditorValue(draft) || attachments.length > 0
    if (hasContent && mode != null) {
      const currentLabel = mode === 'note' ? 'note' : 'reply'
      Modal.confirm({
        title: 'Discard changes?',
        content: `Are you sure you want to discard your ${currentLabel}?`,
        okText: 'Discard',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: switchMode,
      })
      return
    }

    switchMode()
  }

  const isNote = showNoteOption && mode === 'note'

  const modePicker =
    showNoteOption && onCommentVisibilityChange ? (
      <Flex gap={8} wrap="wrap">
        <Button
          className="cc-btn-note"
          icon={<CommentOutlined />}
          onClick={() => handleModeChange('note')}
          style={mode === 'note' ? { background: '#faad14', borderColor: '#faad14', color: '#fff' } : {}}
        >
          Add note
        </Button>
        <Button
          className="cc-btn-reply"
          icon={<SendOutlined />}
          onClick={() => handleModeChange('reply')}
          style={mode === 'reply' ? { background: '#1677ff', borderColor: '#1677ff', color: '#fff' } : {}}
        >
          Reply
        </Button>
      </Flex>
    ) : null

  const modePickerStyle = (
    <style>{`
      .cc-btn-note:not([disabled]):hover { background: #faad14 !important; border-color: #faad14 !important; color: #fff !important; }
      .cc-btn-reply:not([disabled]):hover { background: #1677ff !important; border-color: #1677ff !important; color: #fff !important; }
    `}</style>
  )

  if (showNoteOption && mode == null) {
    return (
      <Flex vertical gap={8} style={{ marginTop: 8 }}>
        {modePickerStyle}
        {modePicker}
      </Flex>
    )
  }

  const accentColor = isNote ? '#faad14' : '#1677ff'

  return (
    <div style={{ marginTop: 12, border: `1px solid ${accentColor}`, borderRadius: 8, overflow: 'hidden' }}>
      {modePickerStyle}
      {/* Mode picker row */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${accentColor}` }}>
        {modePicker}
      </div>

      {/* Tag agents (note) */}
      {showNoteOption && mode === 'note' && nonCustomerUsers.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${accentColor}` }}>
          <Flex align="center" gap={8}>
            <UserAddOutlined style={{ color: '#666' }} />
            <Select
              mode="multiple"
              placeholder="Tag agents (optional) — search by name or email"
              value={taggedUserIds}
              onChange={setTaggedUserIds}
              options={tagAgentOptions}
              allowClear
              showSearch
              filterOption={filterTagAgents}
              style={{ flex: 1 }}
              maxTagCount="responsive"
              variant="borderless"
            />
          </Flex>
        </div>
      )}

      {/* CC / BCC (reply) */}
      {showReplyCcBcc && ((showNoteOption && mode === 'reply') || !showNoteOption) && (
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${accentColor}` }}>
          <Flex vertical gap={4}>
            <Flex align="center" gap={8}>
              <span style={{ fontSize: 12, color: '#666', minWidth: 36 }}>CC</span>
              <Select
                mode="tags"
                placeholder="Optional: select from company or type email"
                value={ccEmails}
                onChange={(v) => setCcEmails(Array.isArray(v) ? v : [])}
                options={ccOptions}
                allowClear
                style={{ flex: 1 }}
                maxTagCount="responsive"
                tokenSeparators={[',', ';', ' ']}
                variant="borderless"
              />
            </Flex>
            {showNoteOption && (
              <Flex align="center" gap={8}>
                <span style={{ fontSize: 12, color: '#666', minWidth: 36 }}>BCC</span>
                <Select
                  mode="tags"
                  placeholder="Optional: type email"
                  value={bccEmails}
                  onChange={(v) => setBccEmails(Array.isArray(v) ? v : [])}
                  options={[]}
                  allowClear
                  style={{ flex: 1 }}
                  maxTagCount="responsive"
                  tokenSeparators={[',', ';', ' ']}
                  variant="borderless"
                />
              </Flex>
            )}
          </Flex>
        </div>
      )}

      {/* Editor — no padding so Quill fills full width */}
      <CommentWysiwyg
        key={mode ?? 'composer'}
        ticketId={ticketId}
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        height="310px"
        noBorder
      />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: `1px solid ${accentColor}` }}>
          <Flex gap={8} wrap="wrap" align="center">
            {attachments.map((a, i) => (
              <Flex key={i} align="center" gap={4} style={{ padding: '4px 8px', background: '#f5f5f5', borderRadius: 6 }}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <PaperClipOutlined /> {a.file_name}
                </a>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
              </Flex>
            ))}
          </Flex>
        </div>
      )}

      <input
        type="file"
        multiple
        style={{ display: 'none' }}
        id="comment-files-input"
        onChange={(e) => {
          const fileList = e.target.files
          const filesArray = fileList ? Array.from(fileList) : []
          e.target.value = ''
          handleFilesSelected(filesArray)
        }}
      />

      {/* Action bar */}
      <div style={{ padding: '8px 12px', borderTop: `1px solid ${accentColor}` }}>
        <Flex justify="space-between" align="center">
          <Flex gap={8}>
            <Button
              icon={<PaperClipOutlined />}
              onClick={() => document.getElementById('comment-files-input')?.click()}
              loading={uploading}
            >
              Attach files
            </Button>
            {showNoteOption && (
              <Popover
                trigger="click"
                placement="topLeft"
                open={cannedOpen}
                onOpenChange={(o) => void openCanned(o)}
                content={
                  <div style={{ width: 340 }}>
                    <Input allowClear autoFocus prefix={<SearchOutlined />} placeholder="Search canned responses…" value={cannedQuery} onChange={(e) => setCannedQuery(e.target.value)} />
                    <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
                      {canned === null ? (
                        <div style={{ padding: 8, color: '#8c8c8c' }}>Loading…</div>
                      ) : cannedShown.length === 0 ? (
                        <div style={{ padding: 8, color: '#8c8c8c' }}>{canned.length === 0 ? 'No canned responses yet. Add some in Settings.' : 'Nothing matches.'}</div>
                      ) : (
                        cannedShown.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={cannedBusy}
                            onClick={() => void insertCanned(c)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 0, background: 'transparent', cursor: 'pointer', borderRadius: 6 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ fontWeight: 600 }}>
                              {c.title}
                              {c.shortcut ? <span style={{ fontWeight: 400, color: '#8c8c8c' }}>  /{c.shortcut}</span> : null}
                            </div>
                            <div style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cannedPreview(c.content)}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                }
              >
                <Button icon={<ThunderboltOutlined />}>Canned responses</Button>
              </Popover>
            )}
          </Flex>
          <Flex gap={8}>
            <Button
              onClick={() => {
                setDraft('')
                setAttachments([])
                setTaggedUserIds([])
                if (showNoteOption) {
                  onCommentVisibilityChange?.(null as any)
                }
                onCancel?.()
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={handleSubmit}
              loading={loading}
              disabled={loading}
              style={isNote
                ? { background: '#faad14', borderColor: '#faad14', color: '#fff', width: 160 }
                : { background: '#1677ff', borderColor: '#1677ff', color: '#fff', width: 160 }}
              type={undefined}
            >
              {showNoteOption ? (mode === 'note' ? 'Add note' : 'Reply') : 'Reply'}
            </Button>
          </Flex>
        </Flex>
      </div>
    </div>
  )
}
