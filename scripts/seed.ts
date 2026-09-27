/**
 * Seed Firestore: ticket_statuses, ticket_types, job_types, message_templates, users (+ Firebase Auth accounts).
 * Run: npm run db:seed
 *
 * Env:
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (required)
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME — default admin when SEED_USERS is empty
 *   SEED_USERS — extra users: 'email1:pass1:Name1,email2:pass2:Name2' (role: user)
 *   SEED_RESET_STATUSES=1 — replace existing ticket_statuses (default: only seed when empty)
 *
 * Seeding a collection is skipped when it already has rows, so the script is safe to re-run.
 */
import 'dotenv/config'

import { createAppUser, findUserByEmail } from '../lib/app-users'
import { isFirebaseAdminConfigured } from '../lib/firebase/admin'
import { count, insertMany, jobTypes, removeWhere, ticketStatuses, ticketTypes } from '../lib/fsdb'
import { DEFAULT_JOB_TYPES } from '../lib/job-types-defaults'
import { ensureDefaultMessageTemplates } from '../lib/message-templates-defaults'

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

/** All seeded statuses are is_deletable = false so they cannot be removed from the API/UI. */
async function seedTicketStatuses() {
  const existing = await count(ticketStatuses)
  if (existing > 0 && process.env.SEED_RESET_STATUSES !== '1') return
  if (existing > 0) await removeWhere(ticketStatuses, [['slug', '!=', '']])
  await insertMany(
    ticketStatuses,
    STATUSES.map((s) => ({ ...s, isDeletable: false, isActive: true }))
  )
  console.log(`Seeded ticket_statuses: open → closed (${STATUSES.length} rows, is_deletable=false)`)
}

async function seedTicketTypes() {
  if ((await count(ticketTypes)) > 0) return
  await insertMany(ticketTypes, [
    { slug: 'bug', title: 'Bug', color: '#ff4d4f', sortOrder: 1 },
    { slug: 'feature', title: 'Feature', color: '#52c41a', sortOrder: 2 },
    { slug: 'task', title: 'Task', color: '#1890ff', sortOrder: 3 },
    { slug: 'support', title: 'Support', color: '#fa8c16', sortOrder: 4 },
  ])
  console.log('Created ticket_types: bug, feature, task, support')
}

async function seedJobTypes() {
  if ((await count(jobTypes)) > 0) return
  await insertMany(jobTypes, DEFAULT_JOB_TYPES.map((j) => ({ ...j })))
  console.log('Created job_types')
}

type SeedUserRow = {
  email: string
  password: string
  fullName: string
  role: string
}

function buildUsersToSeed(): SeedUserRow[] {
  const list: SeedUserRow[] = []
  const seedUsers = process.env.SEED_USERS
  if (seedUsers) {
    for (const part of seedUsers.split(',')) {
      const [email, password, name] = part.trim().split(':')
      if (email) {
        list.push({
          email: email.trim(),
          password: (password || 'admin123').trim(),
          fullName: (name || email.split('@')[0]).trim(),
          role: 'user',
        })
      }
    }
  }
  if (list.length === 0) {
    list.push({
      email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
      fullName: process.env.SEED_ADMIN_NAME || 'Admin',
      role: 'admin',
    })
  }
  return list
}

async function seedUsers() {
  for (const u of buildUsersToSeed()) {
    if (await findUserByEmail(u.email)) {
      console.log('User already exists:', u.email)
      continue
    }
    await createAppUser({
      email: u.email,
      password: u.password,
      fullName: u.fullName,
      role: u.role,
      status: 'active',
    })
    console.log('Created user:', u.email, `(role: ${u.role})`)
  }
}

async function main() {
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase Admin is not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)')
  }

  await seedTicketStatuses()
  await seedTicketTypes()
  await seedJobTypes()
  const createdTemplates = await ensureDefaultMessageTemplates()
  if (createdTemplates.length) console.log(`Created message_templates: ${createdTemplates.join(', ')}`)
  await seedUsers()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
