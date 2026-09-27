/** Stable keys seeded in `message_templates` — use in code / automation (not the human title). */
export const MESSAGE_TEMPLATE_KEYS = [
  'agent_notification_new_ticket_created',
  'agent_notification_note_added',
  'agent_notification_requester_replies',
  'agent_notification_ticket_assigned_agent',
  'requester_notification_agent_closes',
  'requester_notification_new_ticket_created',
  'requester_notification_recurring_ticket_created',
  'requester_notification_password_reset',
  'requester_notification_user_activation',
  'template_agent_reply',
] as const

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number]
