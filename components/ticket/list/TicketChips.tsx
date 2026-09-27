'use client'

import type { ReactNode } from 'react'

import { hexAccentToRgba, normalizeAccentHex } from '@/lib/kanban-tag-chip-style'

/** Compact label used across Kanban / List / Card / Round Robin (styles: .kanban-chip in globals.css). */
export function Chip({
  color,
  children,
  onClick,
  title,
}: {
  color?: string | null
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  title?: string
}) {
  const accent = color ? normalizeAccentHex(color) : null
  return (
    <span
      className={`kanban-chip${onClick ? ' is-clickable' : ''}`}
      title={title}
      onClick={onClick}
      style={accent ? { color: accent, background: hexAccentToRgba(accent, 0.12) } : undefined}
    >
      {children}
    </span>
  )
}

/** Status with a colored dot on a soft tint of the status color. */
export function StatusPill({
  color,
  title,
  onClick,
}: {
  color?: string | null
  title: string
  onClick?: (e: React.MouseEvent) => void
}) {
  const accent = color ? normalizeAccentHex(color) : '#94A3B8'
  return (
    <span
      className={`status-pill${onClick ? ' is-clickable' : ''}`}
      style={{ background: hexAccentToRgba(accent, 0.14) }}
      onClick={onClick}
      title={onClick ? 'Filter by this status' : undefined}
    >
      <span className="status-pill__dot" style={{ background: accent }} />
      {title}
    </span>
  )
}

/** P1 red, P2 amber, others teal. */
export function PriorityBadge({ priority }: { priority: number | null | undefined }) {
  if (priority == null || priority <= 0) return null
  const tone = priority === 1 ? 'is-p1' : priority === 2 ? 'is-p2' : 'is-p3'
  return <span className={`kanban-card__prio ${tone}`}>P{priority}</span>
}
