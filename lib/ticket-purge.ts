/**
 * Permanently delete tickets that are already in Trash: rows, attachments (+ files in storage) and history.
 * Email bookkeeping rows (email_messages) are kept but unlinked, so already-synced emails are not imported again;
 * a new reply in the same Gmail thread simply starts a new ticket.
 */
import {
  commentAttachments,
  emailMessages,
  find,
  findBy,
  get,
  removeWhere,
  ticketActivityLog,
  ticketAttachments,
  ticketComments,
  tickets,
  updateWhere,
} from '@/lib/fsdb'
import { deleteTicketCascade } from '@/lib/fsdb/cascade'
import { deleteObject, keyFromPublicUrl } from '@/lib/storage-provider'
import { coerceTicketType } from '@/lib/ticket-classification'

export type PurgeResult = { deleted: number[]; skipped: { id: number; reason: string }[] }

export async function purgeTrashedTickets(ids: number[]): Promise<PurgeResult> {
  const result: PurgeResult = { deleted: [], skipped: [] }
  for (const id of ids) {
    const t = await get(tickets, id)
    if (!t) {
      result.skipped.push({ id, reason: 'not found' })
      continue
    }
    if (coerceTicketType(t.ticketType) !== 'trash') {
      result.skipped.push({ id, reason: 'not in trash' })
      continue
    }

    // Collect stored files before the rows are gone
    const comments = await findBy(ticketComments, { ticketId: id })
    const [ticketFiles, commentFiles] = await Promise.all([
      findBy(ticketAttachments, { ticketId: id }),
      comments.length ? find(commentAttachments, { where: [['commentId', 'in', comments.map((c) => c.id)]] }) : [],
    ])
    const paths = [...ticketFiles, ...commentFiles].map((f) => f.filePath || keyFromPublicUrl(f.fileUrl)).filter(Boolean)

    await Promise.all([
      updateWhere(emailMessages, [['ticketId', '==', id]], { ticketId: null }),
      removeWhere(ticketActivityLog, [['ticketId', '==', id]]),
    ])
    await deleteTicketCascade(id)
    await Promise.all(paths.map((p) => deleteObject(p).catch(() => null)))
    result.deleted.push(id)
  }
  return result
}
