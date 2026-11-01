import { FieldValue } from 'firebase-admin/firestore'

import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'
import { getMany, users } from '@/lib/fsdb'

export type TicketNotificationType =
  | 'mention'
  | 'assignee_added'
  | 'new_ticket_assignee'
  /** New support ticket with nobody assigned (Inbox) */
  | 'new_ticket'
  /** Ticket still unassigned after the reminder threshold */
  | 'inbox_overdue'
  | 'new_comment'
  | 'status_changed'
  /** Service level: a clock is about to run out / has run out */
  | 'sla_warning'
  | 'sla_breach'
  /** A client rated a finished ticket 1-2 */
  | 'csat_low'

/** Bell notifications that are not about a ticket: they open `href` instead */
export type GeneralNotificationType =
  | 'invoice_overdue'
  | 'deposit_low'
  | 'retainer_invoiced'
  /** Calendar: invited, changed, cancelled, starting soon, someone answered */
  | 'calendar_invite'
  | 'calendar_update'
  | 'calendar_cancel'
  | 'calendar_reminder'
  | 'calendar_response'

export function diffNewAssignees(beforeIds: string[], afterIds: string[]): string[] {
  const before = new Set(beforeIds)
  return afterIds.filter((id) => id && !before.has(id))
}

/**
 * Customers only receive ticket push notifications when:
 * - status changes, or
 * - someone who is not a customer posted a public reply (`new_comment` from staff/manager/admin).
 * Staff still receive `new_comment` when the actor is a customer (unchanged).
 */
async function filterRecipientsByRoleAndType(
  recipientUserIds: string[],
  type: TicketNotificationType,
  actorRole: string | null | undefined
): Promise<string[]> {
  const actor = (actorRole ?? '').toLowerCase().trim()
  const actorIsCustomer = actor === 'customer'
  if (recipientUserIds.length === 0) return []

  const rows = await getMany(users, recipientUserIds)
  const roleById = new Map(rows.map((r) => [r.id, (r.role ?? '').toLowerCase().trim()]))

  return recipientUserIds.filter((id) => {
    const rid = String(id).trim()
    const recipientRole = roleById.get(rid) ?? ''
    const recipientIsCustomer = recipientRole === 'customer'

    if (!recipientIsCustomer) {
      if (type === 'new_comment') {
        return actorIsCustomer
      }
      return true
    }

    if (type === 'status_changed') return true
    if (type === 'new_comment' && !actorIsCustomer) return true
    return false
  })
}

/**
 * A bell notification that is not about a ticket (same list as ticket notifications; clicking opens `href`).
 * `label` is the small line above the title, e.g. the invoice number.
 */
export async function notifyUsers(params: {
  recipientUserIds: string[]
  type: GeneralNotificationType
  href: string
  label: string
  title: string
  body: string
  /** Shown as who it is from (default Billing) */
  actorName?: string
}): Promise<void> {
  const fsdb = getFirebaseAdminFirestore()
  const recipients = [...new Set(params.recipientUserIds.map((id) => String(id).trim()).filter(Boolean))]
  if (!fsdb || recipients.length === 0) return
  const batch = fsdb.batch()
  for (const userId of recipients) {
    batch.set(fsdb.collection('users').doc(userId).collection('ticketNotifications').doc(), {
      userId,
      ticketId: 0,
      ticketTitle: params.label.slice(0, 200),
      href: params.href,
      type: params.type,
      title: params.title.slice(0, 200),
      body: params.body.slice(0, 500),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      actorUserId: 'system',
      actorName: params.actorName ?? 'Billing',
    })
  }
  try {
    await batch.commit()
  } catch (e) {
    console.error('[notifyUsers] batch.commit failed:', e)
  }
}

/** Writes one doc per recipient under `users/{userId}/ticketNotifications/{id}`. */
export async function notifyTicketUsers(params: {
  recipientUserIds: string[]
  excludeUserId?: string | null
  ticketId: number
  ticketTitle: string
  type: TicketNotificationType
  title: string
  body: string
  actorUserId: string
  actorName: string
  /** Session role of the actor (e.g. customer, admin, manager, staff). Drives customer vs staff routing for `new_comment`. */
  actorRole?: string | null
}): Promise<void> {
  const fsdb = getFirebaseAdminFirestore()
  if (!fsdb) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[notifyTicketUsers] skipped: Firebase Admin Firestore not configured (check .env service account)')
    }
    return
  }

  const exclude = params.excludeUserId != null ? String(params.excludeUserId).trim() : ''
  const unique = [...new Set(params.recipientUserIds.map((id) => String(id).trim()))].filter(
    (id) => Boolean(id) && id !== exclude
  )
  if (unique.length === 0) return

  const recipients = await filterRecipientsByRoleAndType(unique, params.type, params.actorRole)
  if (recipients.length === 0) return

  const ticketTitle = (params.ticketTitle || 'Ticket').slice(0, 200)
  const batch = fsdb.batch()
  for (const userId of recipients) {
    const ref = fsdb.collection('users').doc(userId).collection('ticketNotifications').doc()
    batch.set(ref, {
      userId,
      ticketId: params.ticketId,
      ticketTitle,
      type: params.type,
      title: params.title.slice(0, 200),
      body: params.body.slice(0, 500),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      actorUserId: params.actorUserId,
      actorName: (params.actorName || 'Someone').slice(0, 200),
    })
  }

  try {
    await batch.commit()
  } catch (e) {
    console.error('[notifyTicketUsers] batch.commit failed:', e)
    if (process.env.NODE_ENV === 'development') {
      console.error('[notifyTicketUsers] recipients:', recipients, 'ticketId:', params.ticketId)
    }
  }
}
