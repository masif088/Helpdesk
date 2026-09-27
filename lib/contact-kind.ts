/** Contacts (portal users) are either a person or an automated sender (bot / no-reply). */
export const CONTACT_KINDS = ['person', 'automated'] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  person: 'Person',
  automated: 'Automated (bot / no-reply)',
}

export function isContactKind(v: unknown): v is ContactKind {
  return typeof v === 'string' && (CONTACT_KINDS as readonly string[]).includes(v)
}

/** Addresses that are clearly machine senders: noreply@, no-reply@, donotreply@, mailer-daemon@, notifications@ … */
export function looksAutomatedEmail(email: string | null | undefined): boolean {
  const local = (email ?? '').toLowerCase().split('@')[0] ?? ''
  return /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|alerts?|automated|system)([-_.+].*)?$/.test(local)
}
