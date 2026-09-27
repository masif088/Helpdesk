/**
 * Default message templates (one per key the code sends). Inserted by `npm run db:seed` and by
 * Settings → Message templates → "Create default templates" — only keys that do not exist yet.
 * Placeholders: see lib/message-template-placeholders.ts ({{ ticket }}, {{ recipient.full_name }}, …).
 */
import type { NewMessageTemplatesRow } from '@/lib/fsdb'
import { find, insertMany, messageTemplates } from '@/lib/fsdb'

const P = (html: string) => `<p>${html}</p>`

const AGENT = 'Agent Notification'
const REQUESTER = 'Requester Notification'
const TEMPLATES = 'Templates'

type DefaultTemplate = Pick<NewMessageTemplatesRow, 'key' | 'title' | 'type' | 'templateGroup' | 'emailSubject' | 'content'>

export const DEFAULT_MESSAGE_TEMPLATES: DefaultTemplate[] = [
  // ── Staff ─────────────────────────────────────────────────────────────
  {
    key: 'agent_notification_new_ticket_created',
    title: 'New ticket for your team',
    type: 'email_notification',
    templateGroup: AGENT,
    emailSubject: 'New ticket #{{ ticket_id }}: {{ ticket_title }}',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('{{ sender.full_name }} ({{ sender.email }}) opened a new ticket for your team:') +
      P('<strong>{{ ticket_title }}</strong><br>{{ ticket }}') +
      P('Nobody is assigned yet — pick it up from the Inbox.'),
  },
  {
    key: 'agent_notification_ticket_assigned_agent',
    title: 'Ticket assigned to you',
    type: 'email_notification',
    templateGroup: AGENT,
    emailSubject: 'You were assigned to #{{ ticket_id }}: {{ ticket_title }}',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('{{ sender.full_name }} assigned you to <strong>{{ ticket_title }}</strong>.') +
      P('{{ ticket }}'),
  },
  {
    key: 'agent_notification_requester_replies',
    title: 'Customer replied',
    type: 'email_notification',
    templateGroup: AGENT,
    emailSubject: 'New reply on #{{ ticket_id }}: {{ ticket_title }}',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('{{ sender.full_name }} replied on {{ ticket }}:') +
      `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #0F9D8A;color:#334155">{{ reply_content }}</blockquote>`,
  },
  {
    key: 'agent_notification_note_added',
    title: 'Internal note added',
    type: 'email_notification',
    templateGroup: AGENT,
    emailSubject: 'Internal note on #{{ ticket_id }}: {{ ticket_title }}',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('{{ sender.full_name }} added an internal note on {{ ticket }}:') +
      `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #F59E0B;color:#334155">{{ reply_content }}</blockquote>`,
  },
  // ── Customers ─────────────────────────────────────────────────────────
  {
    key: 'requester_notification_new_ticket_created',
    title: 'Request received',
    type: 'email_notification',
    templateGroup: REQUESTER,
    emailSubject: 'We received your request (#{{ ticket_id }})',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('Thanks for reaching out. We received your request <strong>{{ ticket_title }}</strong> and our team will get back to you soon.') +
      P('You can follow it here: {{ ticket }}') +
      P('Simply reply to this email to add more information.'),
  },
  {
    key: 'requester_notification_recurring_ticket_created',
    title: 'Scheduled ticket created',
    type: 'email_notification',
    templateGroup: REQUESTER,
    emailSubject: 'Ticket #{{ ticket_id }} has been created: {{ ticket_title }}',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('Your scheduled ticket <strong>{{ ticket_title }}</strong> has been created.') +
      P('{{ ticket }}'),
  },
  {
    key: 'requester_notification_agent_closes',
    title: 'Ticket closed',
    type: 'email_notification',
    templateGroup: REQUESTER,
    emailSubject: 'Ticket #{{ ticket_id }} is closed: {{ ticket_title }}',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('Your ticket <strong>{{ ticket_title }}</strong> has been closed.') +
      P('If something is still not right, reply to this email and we will reopen it. {{ ticket }}'),
  },
  {
    key: 'requester_notification_user_activation',
    title: 'Account activation',
    type: 'email_notification',
    templateGroup: REQUESTER,
    emailSubject: 'Your account is ready',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('An account has been created for you so you can follow your tickets online.') +
      P('Email: <strong>{{ recipient.email }}</strong><br>Temporary password: <strong>{{ temporary_password }}</strong>') +
      P('{{ login_button }}') +
      P('Please change your password after your first sign-in.'),
  },
  {
    key: 'requester_notification_password_reset',
    title: 'Password reset',
    type: 'email_notification',
    templateGroup: REQUESTER,
    emailSubject: 'Your password has been reset',
    content:
      P('Hi {{ recipient.full_name }},') +
      P('Your password has been reset. Your temporary password is <strong>{{ temporary_password }}</strong>.') +
      P('{{ login_button }}') +
      P('If you did not ask for this, contact us right away.'),
  },
  // ── Composer ──────────────────────────────────────────────────────────
  {
    key: 'template_agent_reply',
    title: 'Agent reply',
    type: 'composer_template',
    templateGroup: TEMPLATES,
    emailSubject: null,
    content: P('Hi {{ recipient.first_name }},') + P('') + P('Best regards,<br>{{ sender.full_name }}'),
  },
]

/** Insert the default templates whose key does not exist yet. Returns the keys created. */
export async function ensureDefaultMessageTemplates(): Promise<string[]> {
  const existing = new Set((await find(messageTemplates, { select: ['key'] })).map((r) => r.key))
  const missing = DEFAULT_MESSAGE_TEMPLATES.filter((t) => !existing.has(t.key!))
  if (missing.length === 0) return []
  await insertMany(
    messageTemplates,
    missing.map((t) => ({ ...t, status: 'active' }) as NewMessageTemplatesRow)
  )
  return missing.map((t) => t.key!)
}
