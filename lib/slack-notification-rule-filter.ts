/**
 * Normalizes `slack_ticket_notification_rules.filter` JSON for API POST/PATCH.
 * Keep in sync with `SlackNotifyRuleFilter` in `lib/slack-ticket-notify.ts` and the Slack rules UI.
 */
export function normalizeSlackRuleFilter(body: Record<string, unknown>) {
  const f = (body.filter && typeof body.filter === 'object' ? body.filter : {}) as Record<string, unknown>
  const toSlugs = Array.isArray(f.to_status_slugs)
    ? f.to_status_slugs.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []
  const slackNote = typeof f.slack_note === 'string' ? f.slack_note.trim().slice(0, 1000) : ''
  const tagIds = Array.isArray(f.tag_ids)
    ? f.tag_ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []

  const out: Record<string, unknown> = {
    on_ticket_created: f.on_ticket_created !== false,
    on_status_changed: f.on_status_changed === true,
    on_client_reply: f.on_client_reply === true,
    on_tag_added: f.on_tag_added === true,
    on_sla_warning: f.on_sla_warning === true,
    on_sla_breach: f.on_sla_breach === true,
    team_ids: Array.isArray(f.team_ids) ? f.team_ids.filter((x): x is string => typeof x === 'string') : [],
    company_ids: Array.isArray(f.company_ids)
      ? f.company_ids.filter((x): x is string => typeof x === 'string')
      : [],
    type_ids: Array.isArray(f.type_ids)
      ? f.type_ids.filter((x): x is number => typeof x === 'number' && Number.isInteger(x))
      : [],
    to_status_slugs: toSlugs,
    tag_ids: tagIds,
    account_manager_ids: Array.isArray(f.account_manager_ids)
      ? f.account_manager_ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [],
  }
  if (slackNote.length > 0) {
    out.slack_note = slackNote
  }
  return out
}
