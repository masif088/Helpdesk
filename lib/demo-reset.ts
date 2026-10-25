/**
 * Demo reset (Settings -> Demo reset, only for the operator account): everything goes back to an empty, demo-ready state.
 * What stays and goes is decided in lib/demo-reset-plan.ts.
 *
 *   removed   all tickets and what hangs on them, invoices and payments, the connected mailbox, all automation rules,
 *             every account except the operator and the test customer, every company those two do not belong to
 *   created   one automation rule: new tickets are opened; optionally a few sample tickets for the demo
 *   kept      settings, ticket statuses and types, templates, canned responses, knowledge base, teams, tags, skills
 *
 * Files uploaded to Firebase Storage for removed tickets are not deleted.
 */
import { AUTO_OPEN_RULE, companiesToKeep, COMPANY_CHILD_TABLES, COUNTERS_TO_RESET, DEMO_RESET_OPERATOR, RAW_WIPE_COLLECTIONS, splitUsers, WIPE_TABLES } from '@/lib/demo-reset-plan'
import { deleteAuthUser } from '@/lib/firebase/auth-server'
import * as db from '@/lib/fsdb'
import {
  apiKeys,
  apiTokens,
  appSettings,
  cannedResponses,
  companies,
  companyUsers,
  count,
  fdb,
  find,
  get,
  insert,
  remove,
  removeWhere,
  teamMembers,
  ticketAssignees,
  ticketComments,
  tickets,
  ticketStatuses,
  ticketTypes,
  upsert,
  users,
} from '@/lib/fsdb'
import { refreshSlaReport } from '@/lib/sla-report-cache'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

type AnyTable = Parameters<typeof count>[0]
const table = (name: string) => (db as unknown as Record<string, AnyTable>)[name]

const LAST_RESET_KEY = 'demo_reset_last'

export type DemoResetPlan = {
  keepUsers: { email: string; name: string | null; role: string }[]
  removeUsers: number
  keepCompanies: string[]
  removeCompanies: number
  /** Rows per emptied collection, only those with something in them */
  rows: { table: string; rows: number }[]
  mailboxes: string[]
  lastReset: { at: string; by: string } | null
}

async function loadAccounts() {
  const [userRows, links, companyRows] = await Promise.all([find(users, {}), find(companyUsers, {}), find(companies, { select: ['id', 'name'] })])
  const { keep, remove: gone } = splitUsers(userRows)
  const keepCompanyIds = companiesToKeep(keep, links, new Set(keep.map((u) => u.id)))
  return { userRows, keep, gone, keepCompanyIds, companyRows }
}

/** What a reset would do right now, without doing anything. */
export async function getDemoResetPlan(): Promise<DemoResetPlan> {
  const [{ keep, gone, keepCompanyIds, companyRows }, integrations, last] = await Promise.all([loadAccounts(), find(db.emailIntegrations, {}), get(appSettings, LAST_RESET_KEY)])
  const counted = await Promise.all(WIPE_TABLES.map(async (name) => ({ table: name as string, rows: await count(table(name)) })))
  const raw = await Promise.all(RAW_WIPE_COLLECTIONS.map(async (name) => ({ table: name as string, rows: (await fdb().collection(name).count().get()).data().count })))
  let lastReset: DemoResetPlan['lastReset'] = null
  try {
    lastReset = last?.value ? (JSON.parse(last.value) as { at: string; by: string }) : null
  } catch {
    lastReset = null
  }
  return {
    keepUsers: keep.map((u) => ({ email: u.email, name: u.fullName, role: u.role })),
    removeUsers: gone.length,
    keepCompanies: companyRows.filter((c) => keepCompanyIds.has(c.id)).map((c) => c.name),
    removeCompanies: companyRows.filter((c) => !keepCompanyIds.has(c.id)).length,
    rows: [...counted, ...raw].filter((c) => c.rows > 0),
    mailboxes: integrations.map((i) => i.emailAddress ?? i.provider),
    lastReset,
  }
}

async function wipe(name: string): Promise<number> {
  const t = table(name)
  const n = await count(t)
  if (n > 0) await fdb().recursiveDelete(fdb().collection(t.name))
  return n
}

/** Let go of the Google account behind a connected mailbox (best effort; the rows are removed anyway). */
async function revokeGoogle(token: string | null) {
  if (!token) return
  try {
    await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(8000) })
  } catch {
    /* the mailbox is disconnected on our side either way */
  }
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000)

/** A few tickets so the demo does not start empty: all under the test customer's company, with replies and ratings. */
async function seedSample(operatorId: string, customerId: string, companyId: string): Promise<number> {
  const [types, statuses] = await Promise.all([find(ticketTypes, { orderBy: [['id', 'asc']], limit: 3 }), find(ticketStatuses, {})])
  const has = (slug: string) => statuses.some((s) => s.slug === slug)
  const status = (slug: string) => (has(slug) ? slug : 'open')
  const samples = [
    { title: 'Cannot log in to the client portal', ago: 3, status: 'open', body: 'Hello, I get an error when I try to log in since this morning.' },
    { title: 'Invoice shows the wrong company name', ago: 26, status: 'working_team', body: 'The company name on our latest invoice has a typo. Can you correct it?', reply: 'Thanks for flagging this. We are fixing it and will send a new invoice today.' },
    { title: 'Please confirm the new logo files', ago: 50, status: 'client_review', body: 'We uploaded the new logo set for the website.', reply: 'The logos are in place. Please review them and tell us if anything needs a change.' },
    { title: 'How do I export my tickets?', ago: 120, status: 'closed', body: 'Is there a way to download a list of all our tickets?', reply: 'Yes: open the ticket list, apply your filters and use Export. Let us know if you need help.', rating: 5, comment: 'Fast and clear, thank you!' },
    { title: 'Reset my password', ago: 190, status: 'closed', body: 'I forgot my password and the reset email never arrives.', reply: 'We sent you a fresh reset link. It is valid for one hour.', rating: 4, comment: null },
    { title: 'Wrong amount on last invoice', ago: 76, status: 'closed', body: 'The total on invoice INV-0003 does not match our agreement.', reply: 'You are right, the discount was missing. A corrected invoice is on its way.', rating: 2, comment: 'It took too long to get an answer.' },
  ]
  for (const [i, s] of samples.entries()) {
    const createdAt = hoursAgo(s.ago)
    const repliedAt = new Date(createdAt.getTime() + 45 * 60_000)
    const ticket = await insert(tickets, {
      title: s.title,
      description: `<p>${s.body}</p>`,
      createdBy: customerId,
      contactUserId: customerId,
      companyId,
      status: status(s.status),
      ticketType: 'support',
      typeId: types.length ? types[i % types.length].id : null,
      createdVia: 'portal',
      firstRespondedAt: s.reply ? repliedAt : null,
      csatRating: s.rating ?? null,
      csatComment: s.comment ?? null,
      csatAt: s.rating ? new Date(repliedAt.getTime() + 3600_000) : null,
      csatBy: s.rating ? customerId : null,
      createdAt,
      updatedAt: s.reply ? repliedAt : createdAt,
    })
    await insert(ticketComments, { ticketId: ticket.id, userId: customerId, comment: `<p>${s.body}</p>`, visibility: 'reply', authorType: 'customer', createdAt })
    if (s.reply) await insert(ticketComments, { ticketId: ticket.id, userId: operatorId, comment: `<p>${s.reply}</p>`, visibility: 'reply', authorType: 'agent', createdAt: repliedAt })
    if (s.status !== 'open') await insert(ticketAssignees, { ticketId: ticket.id, userId: operatorId })
  }
  return samples.length
}

export type DemoResetResult = { steps: { step: string; detail: string; ok: boolean }[]; ok: boolean }

export async function runDemoReset(actorEmail: string, opts: { withSample: boolean }): Promise<DemoResetResult> {
  const steps: DemoResetResult['steps'] = []
  const run = async (step: string, fn: () => Promise<string>) => {
    try {
      steps.push({ step, detail: await fn(), ok: true })
    } catch (e) {
      steps.push({ step, detail: (e as Error).message, ok: false })
    }
  }

  const { keep, gone, keepCompanyIds, companyRows } = await loadAccounts()
  const operator = keep.find((u) => u.email.toLowerCase() === DEMO_RESET_OPERATOR)
  if (!operator) throw new Error('The operator account was not found; nothing was changed')

  await run('Mailbox', async () => {
    const rows = await find(db.emailIntegrations, {})
    await Promise.all(rows.map((r) => revokeGoogle(r.refreshToken ?? r.accessToken)))
    return rows.length ? `${rows.length} connected mailbox${rows.length === 1 ? '' : 'es'} released` : 'none connected'
  })

  for (const name of WIPE_TABLES) await run(`Empty ${name}`, async () => `${await wipe(name)} rows`)
  for (const name of RAW_WIPE_COLLECTIONS) {
    await run(`Empty ${name}`, async () => {
      const n = (await fdb().collection(name).count().get()).data().count
      await fdb().recursiveDelete(fdb().collection(name)) // also removes documents that only exist through their subcollections
      return `${n} rows`
    })
  }
  await run('Ticket numbers', async () => {
    for (const c of COUNTERS_TO_RESET) await fdb().collection('_counters').doc(c).delete()
    return 'start again from 1'
  })

  await run('Companies', async () => {
    const goneCompanies = companyRows.filter((c) => !keepCompanyIds.has(c.id))
    for (const c of goneCompanies) {
      for (const t of COMPANY_CHILD_TABLES) await removeWhere(table(t), [['companyId', '==', c.id]] as never)
      await remove(companies, c.id)
    }
    return `${goneCompanies.length} removed, ${keepCompanyIds.size} kept`
  })

  await run('Accounts', async () => {
    for (const u of gone) {
      await deleteAuthUser(u.id)
      await Promise.all([
        removeWhere(teamMembers, [['userId', '==', u.id]]),
        removeWhere(apiTokens, [['userId', '==', u.id]]),
        removeWhere(apiKeys, [['userId', '==', u.id]]),
        removeWhere(cannedResponses, [['ownerId', '==', u.id]]),
        fdb().recursiveDelete(fdb().collection('users').doc(u.id).collection('ticketNotifications')),
      ])
      await remove(users, u.id)
    }
    return `${gone.length} removed, ${keep.length} kept`
  })

  await run('Notifications', async () => {
    for (const u of keep) await fdb().recursiveDelete(fdb().collection('users').doc(u.id).collection('ticketNotifications'))
    return 'bell emptied'
  })

  await run('Automation', async () => {
    await insert(db.automationRules, { ...AUTO_OPEN_RULE, conditions: { ...AUTO_OPEN_RULE.conditions }, actions: { ...AUTO_OPEN_RULE.actions } })
    return 'one rule: new tickets are opened'
  })

  if (opts.withSample) {
    await run('Sample tickets', async () => {
      const customer = keep.find((u) => u.id !== operator.id && (u.role ?? '').toLowerCase() === 'customer')
      const companyId = customer?.companyId ?? [...keepCompanyIds][0]
      if (!customer || !companyId) return 'skipped: no test customer with a company'
      return `${await seedSample(operator.id, customer.id, companyId)} tickets with replies and ratings`
    })
  }

  await run('Caches', async () => {
    revalidateTicketsLookupCatalog()
    refreshSlaReport()
    await upsert(appSettings, { key: LAST_RESET_KEY, value: JSON.stringify({ at: new Date().toISOString(), by: actorEmail }) })
    return 'refreshed'
  })

  return { steps, ok: steps.every((s) => s.ok) }
}
