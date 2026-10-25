'use client'

import { useCallback, useEffect } from 'react'

import { BRANDING } from '@/lib/branding'

interface Comment {
  id: string
  comment: string
  created_at: string
  visibility?: 'note' | 'reply'
  author_type?: 'customer' | 'agent' | 'automation'
  user?: { id: string; full_name: string | null; email: string }
}

interface TicketPrintViewProps {
   
  ticketData: Record<string, any>
  comments: Comment[]
  isAgent?: boolean
}

function htmlToText(html: string): string {
  if (typeof document === 'undefined') return html
  const el = document.createElement('div')
  el.innerHTML = html
  return el.innerText ?? el.textContent ?? ''
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TicketPrintView({ ticketData: t, comments, isAgent }: TicketPrintViewProps) {
  useEffect(() => {
    window.print()
  }, [])

  const createdBy = t?.creator?.full_name || t?.creator?.email || '—'
  const company = t?.company?.name || '—'
  const team = t?.team?.name || '—'
  const agent = t?.assignees?.[0]?.user?.full_name || t?.assignees?.[0]?.user?.email || '—'

  const downloadMd = useCallback(() => {
    const lines: string[] = []
    lines.push(`# [#${t?.id}] ${t?.title ?? ''}`)
    lines.push('')
    lines.push('## Details')
    lines.push(`| Field | Value |`)
    lines.push(`|-------|-------|`)
    lines.push(`| Status | ${t?.status ?? '—'} |`)
    lines.push(`| Priority | ${t?.priority ?? '—'} |`)
    lines.push(`| Source | ${t?.source ?? '—'} |`)
    lines.push(`| Type | ${t?.ticket_type ?? '—'} |`)
    lines.push(`| Company | ${company} |`)
    lines.push(`| Team | ${team} |`)
    lines.push(`| Agent | ${agent} |`)
    lines.push(`| Created by | ${createdBy} |`)
    lines.push(`| Created at | ${t?.created_at ? formatDate(t.created_at) : '—'} |`)
    if (t?.due_date) lines.push(`| Due date | ${formatDate(t.due_date)} |`)
    lines.push('')
    if (t?.description) {
      lines.push('## Description')
      lines.push('')
      lines.push(htmlToText(t.description))
      lines.push('')
    }
    if (comments.length > 0) {
      lines.push(`## Comments (${comments.length})`)
      lines.push('')
      for (const c of comments) {
        const author = c.user?.full_name || c.user?.email || 'Unknown'
        const badge = c.visibility === 'note' ? ' `Note`' : c.visibility === 'reply' ? ' `Reply`' : ''
        lines.push(`### ${author}${badge} — ${formatDate(c.created_at)}`)
        lines.push('')
        lines.push(htmlToText(c.comment))
        lines.push('')
      }
    }
    lines.push('---')
    lines.push(`*${BRANDING.name} — Ticket #${t?.id} — Exported ${new Date().toLocaleString()}*`)

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ticket-${t?.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [t, comments, createdBy, company, team, agent])

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 13px; color: #000; background: #fff; }
        .print-wrap { max-width: 860px; margin: 0 auto; padding: 32px 40px; }
        .print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
        .print-header h1 { font-size: 18px; margin: 0 0 4px; }
        .print-header .ticket-num { font-size: 20px; font-weight: bold; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px 24px; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 16px; }
        .meta-item label { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #666; display: block; margin-bottom: 2px; }
        .meta-item span { font-size: 13px; }
        .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; color: #333; margin: 20px 0 8px; letter-spacing: 0.5px; }
        .description-box { border: 1px solid #ddd; border-radius: 4px; padding: 14px 16px; margin-bottom: 24px; line-height: 1.6; word-break: break-word; }
        .comment-block { border: 1px solid #ddd; border-radius: 4px; margin-bottom: 14px; overflow: hidden; }
        .comment-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: #f5f5f5; border-bottom: 1px solid #ddd; }
        .comment-header.note { background: #fffbe6; border-bottom-color: #ffe58f; }
        .comment-header.reply { background: #e6f4ff; border-bottom-color: #91caff; }
        .comment-header .author { font-weight: bold; font-size: 12px; }
        .comment-header .meta { font-size: 11px; color: #666; }
        .comment-header .badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: bold; text-transform: uppercase; }
        .badge-note { background: #faad14; color: #fff; }
        .badge-reply { background: #1677ff; color: #fff; }
        .comment-body { padding: 12px 14px; line-height: 1.6; word-break: break-word; }
        .description-box ul, .description-box ol, .comment-body ul, .comment-body ol { padding-left: 20px; margin: 8px 0; }
        .description-box li, .comment-body li { margin-bottom: 6px; }
        .description-box p, .comment-body p { margin: 0 0 8px; }
        .print-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
        @media print {
          @page { margin: 16mm 12mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="print-wrap">
        {isAgent && (
          <div className="no-print" style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={downloadMd}
              style={{ padding: '6px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', fontFamily: 'Arial, sans-serif' }}
            >
              ⬇ Download as MD
            </button>
          </div>
        )}
        {/* Header */}
        <div className="print-header">
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{BRANDING.name}</div>
            <h1>{t?.title}</h1>
          </div>
          <div className="ticket-num">#{t?.id}</div>
        </div>

        {/* Meta grid */}
        <div className="meta-grid">
          <div className="meta-item"><label>Status</label><span>{t?.status ?? '—'}</span></div>
          <div className="meta-item"><label>Priority</label><span>{t?.priority ?? '—'}</span></div>
          <div className="meta-item"><label>Source</label><span>{t?.source ?? '—'}</span></div>
          <div className="meta-item"><label>Type</label><span>{t?.ticket_type ?? '—'}</span></div>
          <div className="meta-item"><label>Company</label><span>{company}</span></div>
          <div className="meta-item"><label>Team</label><span>{team}</span></div>
          <div className="meta-item"><label>Agent</label><span>{agent}</span></div>
          <div className="meta-item"><label>Created by</label><span>{createdBy}</span></div>
          <div className="meta-item"><label>Created at</label><span>{formatDate(t?.created_at)}</span></div>
          {t?.due_date && <div className="meta-item"><label>Due date</label><span>{formatDate(t.due_date)}</span></div>}
        </div>

        {/* Description */}
        {t?.description && (
          <>
            <div className="section-title">Description</div>
            <div
              className="description-box"
               
              dangerouslySetInnerHTML={{ __html: t.description }}
            />
          </>
        )}

        {/* Comments */}
        {comments.length > 0 && (
          <>
            <div className="section-title">Comments ({comments.length})</div>
            {comments.map((c) => {
              const isNote = c.visibility === 'note'
              const isReply = c.visibility === 'reply'
              return (
                <div key={c.id} className="comment-block">
                  <div className={`comment-header ${isNote ? 'note' : isReply ? 'reply' : ''}`}>
                    <div>
                      <span className="author">{c.user?.full_name || c.user?.email || 'Unknown'}</span>
                      {isNote && <span className="badge badge-note" style={{ marginLeft: 8 }}>Note</span>}
                      {isReply && <span className="badge badge-reply" style={{ marginLeft: 8 }}>Reply</span>}
                    </div>
                    <span className="meta">{formatDate(c.created_at)}</span>
                  </div>
                  <div
                    className="comment-body"
                     
                    dangerouslySetInnerHTML={{ __html: c.comment }}
                  />
                </div>
              )
            })}
          </>
        )}

        {/* Footer */}
        <div className="print-footer">
          <span>{BRANDING.name} — Ticket #{t?.id}</span>
          <span>Printed {new Date().toLocaleString()}</span>
        </div>
      </div>
    </>
  )
}
