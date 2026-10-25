/** Pure SLA helpers shared by server and client code (no database imports). */

export type SlaState = 'ok' | 'at_risk' | 'breached' | 'met' | 'missed'

export type SlaClock = {
  targetMinutes: number
  dueAt: string
  /** When it was answered / finished; null while it is still running */
  doneAt: string | null
  state: SlaState
  /** Seconds left (negative when overdue); null once done */
  remainingSeconds: number | null
  /** Waiting on the client: the clock is stopped */
  paused?: boolean
  /** The clock is counting right now (not paused, inside business hours) */
  ticking?: boolean
  /** When `remainingSeconds` was measured (ISO); a ticking clock counts down from here */
  asOf?: string
}

export type TicketSla = { respond: SlaClock | null; resolve: SlaClock | null }

export const MAX_SLA_MINUTES = 60 * 24 * 365

/** "2h 15m", "45m", "3d 4h" for a number of seconds (absolute value). */
export function formatSlaDuration(seconds: number): string {
  const s = Math.abs(Math.round(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`
  return `${Math.max(m, s > 0 ? 1 : 0)}m`
}

/** A target in minutes as text: "1h", "2d", "90m". */
export function formatSlaTarget(minutes: number | null | undefined): string {
  return minutes ? formatSlaDuration(minutes * 60) : '—'
}
