'use client'

import { RobotOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useState } from 'react'

import type { SummarizeAnchorRequest } from '@/lib/ticket-summarize-types'

import CommentAiSummaryModal from './CommentAiSummaryModal'

export type CommentAiSummaryTriggerProps = {
  ticketId: number
  summarizeAnchor: SummarizeAnchorRequest
  onAddComment?: (html: string) => Promise<void>
  onAddChecklistItems?: (titles: string[]) => Promise<void>
  onApplyToDescription?: (html: string) => Promise<void>
  addCommentLoading?: boolean
  disabled?: boolean
  size?: 'small' | 'middle' | 'large'
  tooltip?: string
  variant?: 'ticket' | 'default'
}

export default function CommentAiSummaryTrigger({
  ticketId,
  summarizeAnchor,
  onAddComment,
  onAddChecklistItems,
  onApplyToDescription,
  addCommentLoading = false,
  disabled = false,
  size = 'middle',
  tooltip,
  variant = 'default',
}: CommentAiSummaryTriggerProps) {
  const [open, setOpen] = useState(false)
  const [hasSavedSummary, setHasSavedSummary] = useState(false)

  if (!ticketId || ticketId <= 0) return null
  if (!onAddComment && !onApplyToDescription) return null

  const tooltipText =
    tooltip ??
    (hasSavedSummary
      ? summarizeAnchor.type === 'comment'
        ? 'View saved AI summary for this comment (English)'
        : 'View saved AI summary (English)'
      : summarizeAnchor.type === 'comment'
        ? 'Generate AI summary for this comment once (English)'
        : 'Generate AI summary once (English)')

  const isTicketVariant = variant === 'ticket'

  return (
    <>
      <Tooltip title={tooltipText}>
        <Button
          icon={<RobotOutlined />}
          size={size}
          disabled={disabled || addCommentLoading}
          onClick={() => setOpen(true)}
          aria-label="AI summary"
          style={isTicketVariant ? { color: '#0E7490', borderColor: '#0E7490' } : undefined}
        />
      </Tooltip>
      <CommentAiSummaryModal
        open={open}
        onClose={() => setOpen(false)}
        ticketId={ticketId}
        summarizeAnchor={summarizeAnchor}
        addCommentLoading={addCommentLoading}
        onAddComment={onAddComment}
        onAddChecklistItems={onAddChecklistItems}
        onApplyToDescription={onApplyToDescription}
        onSummarySaved={() => {
          setHasSavedSummary(true)
        }}
      />
    </>
  )
}
