import {
  companies,
  find,
  findBy,
  findOneBy,
  get,
  slackTicketNotificationRules,
  teams,
  tickets,
  ticketTags,
  ticketTypes,
  users,
} from '@/lib/fsdb'

export type SlackTicketNotifyEvent = 'ticket_created' | 'status_changed' | 'client_reply' | 'tag_added'

export type SlackNotifyRuleFilter = {
  /** Default true */
  on_ticket_created?: boolean
  /** Default false */
  on_status_changed?: boolean
  /** Customer / portal comment on ticket — default false */
  on_client_reply?: boolean
  /** A tag was added to a ticket — default false */
  on_tag_added?: boolean
  /** Non-empty = ticket must match one of these (null field on ticket = no match) */
  team_ids?: string[]
  company_ids?: string[]
  type_ids?: number[]
  /**
   * When non-empty and event is `status_changed`, the ticket's **new** status slug must be one of these.
   * Ignored for `ticket_created` and `client_reply`.
   */
  to_status_slugs?: string[]
  /** When non-empty, the ticket must have at least one of these tag IDs (`ticket_tags`). */
  tag_ids?: string[]
  /** When non-empty, the ticket's company must have one of these users as active_manager_id. */
  account_manager_ids?: string[]
  /** Optional line(s) prepended to the Slack message for this rule (plain text; shortened when posting). */
  slack_note?: string
}

export type SlackTicketPayload = {
  id: number
  title: string
  status: string
  teamId: string | null
  priority: number | null
  companyId: string | null
  typeId: number | null
  previousStatus?: string
  /** Plain-text preview of reply (HTML stripped) */
  bodyPreview?: string
  actorName?: string
  /** Tag names that were added (for tag_added event) */
  addedTagNames?: string[]
}

function parseFilter(raw: unknown): SlackNotifyRuleFilter {
  if (!raw || typeof raw !== 'object') return {}
  return raw as SlackNotifyRuleFilter
}

function eventAllowed(filter: SlackNotifyRuleFilter, event: SlackTicketNotifyEvent): boolean {
  if (event === 'ticket_created') return filter.on_ticket_created !== false
  if (event === 'status_changed') return filter.on_status_changed === true
  if (event === 'client_reply') return filter.on_client_reply === true
  if (event === 'tag_added') return filter.on_tag_added === true
  return false
}

async function matchesDimensions(
  filter: SlackNotifyRuleFilter,
  ticket: SlackTicketPayload,
  event: SlackTicketNotifyEvent,
  ticketTagIds: string[]
): Promise<boolean> {
  const { team_ids, company_ids, type_ids, to_status_slugs, tag_ids, account_manager_ids } = filter
  if (team_ids && team_ids.length > 0) {
    if (!ticket.teamId || !team_ids.includes(ticket.teamId)) return false
  }
  if (company_ids && company_ids.length > 0) {
    if (!ticket.companyId || !company_ids.includes(ticket.companyId)) return false
  }
  if (type_ids && type_ids.length > 0) {
    if (ticket.typeId == null || !type_ids.includes(ticket.typeId)) return false
  }
  if (to_status_slugs && to_status_slugs.length > 0 && event === 'status_changed') {
    if (!to_status_slugs.includes(ticket.status)) return false
  }
  if (tag_ids && tag_ids.length > 0) {
    const has = tag_ids.some((id) => ticketTagIds.includes(id))
    if (!has) return false
  }
  if (account_manager_ids && account_manager_ids.length > 0) {
    if (!ticket.companyId) return false
    const c = await get(companies, ticket.companyId)
    if (!c?.activeManagerId || !account_manager_ids.includes(c.activeManagerId)) return false
  }
  return true
}

async function loadTicketTagIds(ticketId: number): Promise<string[]> {
  const rows = await findBy(ticketTags, { ticketId })
  return rows.map((r) => r.tagId)
}

function maskForSlack(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

export function maskWebhookUrlForDisplay(url: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('slack.com')) return `${u.hostname}/…`
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1] || ''
    const tail = last.length > 4 ? last.slice(-4) : last
    return `hooks.slack.com/…/${tail}`
  } catch {
    return '(invalid URL)'
  }
}

export function isSlackIncomingWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      u.hostname === 'hooks.slack.com' &&
      u.pathname.startsWith('/services/')
    )
  } catch {
    return false
  }
}

async function loadLabels(ticket: SlackTicketPayload): Promise<{
  team?: string
  /** Always set for Slack body (name, or fallback text). */
  company: string
  priority?: string
  type?: string
}> {
  const ticketRow = await get(tickets, ticket.id)

  let companyId = ticket.companyId ?? ticketRow?.companyId ?? null
  const createdBy = ticketRow?.createdBy ?? null
  if (!companyId && createdBy) {
    const u = await get(users, createdBy)
    companyId = u?.companyId ?? null
  }

  let companyLabel = 'Not set'
  if (companyId) {
    const c = await get(companies, companyId)
    companyLabel = c?.name?.trim() || 'Unknown company'
  }

  const out: {
    team?: string
    company: string
    priority?: string
    type?: string
  } = { company: companyLabel }

  const jobs: Promise<void>[] = []
  if (ticket.teamId) {
    jobs.push(
      (async () => {
        const r = await get(teams, ticket.teamId!)
        if (r?.name) out.team = r.name
      })()
    )
  }
  if (ticket.priority != null && ticket.priority !== undefined) {
    out.priority = `P${ticket.priority}`
  }
  if (ticket.typeId != null) {
    jobs.push(
      (async () => {
        const r = await get(ticketTypes, ticket.typeId!)
        if (r?.title) out.type = r.title
      })()
    )
  }
  await Promise.all(jobs)
  return out
}

function buildMessage(
  event: SlackTicketNotifyEvent,
  ticket: SlackTicketPayload,
  labels: Awaited<ReturnType<typeof loadLabels>>,
  ticketUrl: string
): string {
  const link = `<${ticketUrl}|#${ticket.id}: ${maskForSlack(ticket.title, 120)}>`
  const companyLine = `*Company:* ${maskForSlack(labels.company, 200)}`
  const bits: string[] = []
  if (labels.team) bits.push(`Team: ${labels.team}`)
  if (labels.priority) bits.push(`Priority: ${labels.priority}`)
  if (labels.type) bits.push(`Type: ${labels.type}`)
  const meta = bits.length > 0 ? `\n${bits.join(' · ')}` : ''

  if (event === 'ticket_created') {
    return `*New ticket* ${link}\n${companyLine}${meta}\nStatus: \`${ticket.status}\``
  }
  if (event === 'client_reply') {
    const who = ticket.actorName ? maskForSlack(ticket.actorName, 80) : 'Client'
    const preview = ticket.bodyPreview?.trim()
      ? maskForSlack(ticket.bodyPreview.trim(), 220)
      : '(no text / attachment only)'
    return `*Client replied* ${link}\n${companyLine}${meta}\n_${who}:_ ${preview}`
  }
  if (event === 'tag_added') {
    const tagList = ticket.addedTagNames && ticket.addedTagNames.length > 0
      ? ticket.addedTagNames.map((t) => `\`${t}\``).join(', ')
      : 'a tag'
    return `*Tag added* ${link}\n${companyLine}${meta}\nAdded: ${tagList}`
  }
  const from = ticket.previousStatus ?? '?'
  return `*Ticket status changed* ${link}\n${companyLine}${meta}\n\`${from}\` → \`${ticket.status}\``
}

async function postWebhook(url: string, text: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook ${res.status}: ${body.slice(0, 200)}`)
  }
}

/**
 * Fire-and-forget from API routes: matches enabled rules and POSTs to each webhook.
 */
export async function notifySlackTicketEvent(
  event: SlackTicketNotifyEvent,
  ticket: SlackTicketPayload
): Promise<void> {
  try {
    const rules = await find(slackTicketNotificationRules, {
      where: [['isEnabled', '==', true]],
      orderBy: [['sortOrder', 'asc'], ['createdAt', 'asc']],
    })

    const needTagLookup = rules.some((r) => {
      const f = parseFilter(r.filter)
      return Array.isArray(f.tag_ids) && f.tag_ids.length > 0
    })
    const ticketTagIds = needTagLookup ? await loadTicketTagIds(ticket.id) : []

    const matchResults = await Promise.all(
      rules.map(async (r) => {
        const f = parseFilter(r.filter)
        if (!eventAllowed(f, event)) return false
        return matchesDimensions(f, ticket, event, ticketTagIds)
      })
    )
    const matched = rules.filter((_, i) => matchResults[i])
    if (matched.length === 0) return

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || 'http://localhost:3000'
    const ticketUrl = `${baseUrl}/tickets/${ticket.id}`
    const labels = await loadLabels(ticket)
    const text = buildMessage(event, ticket, labels, ticketUrl)

    await Promise.all(
      matched.map((r) => {
        const f = parseFilter(r.filter)
        const rawNote = typeof f.slack_note === 'string' ? f.slack_note.trim() : ''
        const prefix = rawNote.length > 0 ? `_${maskForSlack(rawNote, 900)}_\n\n` : ''
        return postWebhook(r.webhookUrl, prefix + text).catch((err) => {
          console.error('[slack-ticket-notify] webhook failed', r.id, err)
        })
      })
    )
  } catch (e) {
    console.error('[slack-ticket-notify]', e)
  }
}
