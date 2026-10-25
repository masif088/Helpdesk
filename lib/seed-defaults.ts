/**
 * Starting data every installation needs: ticket statuses, ticket types, job types and message templates.
 * Used by `npm run db:seed` and by the first-run setup page. Each part is skipped when it already has rows,
 * so running it again is safe.
 */
import { count, insertMany, jobTypes, removeWhere, ticketStatuses, ticketTypes } from '@/lib/fsdb'
import { DEFAULT_JOB_TYPES } from '@/lib/job-types-defaults'
import { ensureDefaultMessageTemplates } from '@/lib/message-templates-defaults'

const STATUSES = [
  { slug: 'open', title: 'Open', customerTitle: 'Ticket received', description: 'Ticket has been received and is in the queue.', color: '#F1C232', showInKanban: true, sortOrder: 1 },
  { slug: 'received', title: 'Received', customerTitle: "We've seen your request", description: 'Our team has acknowledged your request.', color: '#C9DAF8', showInKanban: true, sortOrder: 2 },
  { slug: 'question', title: 'Question', customerTitle: 'Waiting for your reply', description: "We're waiting for information from you.", color: '#6D9EEB', showInKanban: true, sortOrder: 3 },
  { slug: 'working_team', title: 'Working Team', customerTitle: "We're working on it", description: 'We are actively working on this ticket.', color: '#D9EAD3', showInKanban: true, sortOrder: 4 },
  { slug: 'am_review', title: 'AM Review', customerTitle: "We're reviewing internally", description: 'Under internal review before the next customer update.', color: '#6D9EEB', showInKanban: true, sortOrder: 5 },
  { slug: 'client_review', title: 'Client Review', customerTitle: 'Ready for your review', description: 'Please review our work and share feedback.', color: '#52c41a', showInKanban: true, sortOrder: 6 },
  { slug: 'feedback_received', title: 'Feedback Received', customerTitle: "We've received your feedback", description: 'We have received your feedback.', color: '#C9DAF8', showInKanban: true, sortOrder: 7 },
  { slug: 'revision', title: 'Revision', customerTitle: 'Working on your revision', description: 'Implementing changes based on your feedback.', color: '#1890ff', showInKanban: true, sortOrder: 8 },
  { slug: 'pending', title: 'Pending', customerTitle: 'Temporarily paused', description: 'Work on this ticket is temporarily paused.', color: '#8c8c8c', showInKanban: false, sortOrder: 9 },
  { slug: 'resolved', title: 'Resolved', customerTitle: 'All done!', description: 'The work is complete from our side.', color: '#52c41a', showInKanban: false, sortOrder: 10 },
  { slug: 'closed', title: 'Closed', customerTitle: 'All done!', description: 'This ticket is closed.', color: '#595959', showInKanban: false, sortOrder: 11 },
]

/** All seeded statuses are is_deletable = false so they cannot be removed from the API/UI. `reset` replaces existing ones. */
export async function seedTicketStatuses(reset = false): Promise<string | null> {
  const existing = await count(ticketStatuses)
  if (existing > 0 && !reset) return null
  if (existing > 0) await removeWhere(ticketStatuses, [['slug', '!=', '']])
  await insertMany(
    ticketStatuses,
    STATUSES.map((s) => ({ ...s, isDeletable: false, isActive: true }))
  )
  return `Seeded ticket_statuses: open → closed (${STATUSES.length} rows, is_deletable=false)`
}

export async function seedTicketTypes(): Promise<string | null> {
  if ((await count(ticketTypes)) > 0) return null
  await insertMany(ticketTypes, [
    { slug: 'bug', title: 'Bug', color: '#ff4d4f', sortOrder: 1 },
    { slug: 'feature', title: 'Feature', color: '#52c41a', sortOrder: 2 },
    { slug: 'task', title: 'Task', color: '#1890ff', sortOrder: 3 },
    { slug: 'support', title: 'Support', color: '#fa8c16', sortOrder: 4 },
  ])
  return 'Created ticket_types: bug, feature, task, support'
}

export async function seedJobTypes(): Promise<string | null> {
  if ((await count(jobTypes)) > 0) return null
  await insertMany(jobTypes, DEFAULT_JOB_TYPES.map((j) => ({ ...j })))
  return 'Created job_types'
}

/** Everything above plus the default message templates. Returns a line per part that was created. */
export async function seedDefaults(opts: { resetStatuses?: boolean } = {}): Promise<string[]> {
  const created = await ensureDefaultMessageTemplates()
  return [
    await seedTicketStatuses(opts.resetStatuses),
    await seedTicketTypes(),
    await seedJobTypes(),
    created.length ? `Created message_templates: ${created.join(', ')}` : null,
  ].filter((l): l is string => !!l)
}
