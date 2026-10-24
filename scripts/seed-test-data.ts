/**
 * Demo / test data: a team, a company with its users, two agents, two loose contacts, tickets (some finished and rated), time
 * and billing (invoices, one paid), and SLA targets, so every report has something to show.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-test-data.ts      (npm run db:seed:test)
 * Safe to run once: it stops when the test agent already exists. Automation rules are not touched. All accounts: password testing123.
 */
import dayjs from 'dayjs'

import { createAppUser, findUserByEmail } from '../lib/app-users'
import { companies, companyPayments, companyUsers, fdb, find, insert, jobTypes, teamMembers, teams, ticketAssignees, ticketComments, tickets, ticketTimeTracker, ticketTypes, update, users } from '../lib/fsdb'
import { createInvoice, payInvoice } from '../lib/invoices'

const PASSWORD = 'testing123'
const OPERATOR = 'mokhamadasif@gmail.com'

/** `days` ago, at a fixed hour so the data looks like a working day */
const ago = (days: number, hour = 9, minute = 0) => dayjs().subtract(days, 'day').hour(hour).minute(minute).second(0).millisecond(0).toDate()
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000)

async function main() {
  if (await findUserByEmail('testing-staff@test.com')) throw new Error('The test data is already there (testing-staff@test.com exists); nothing was changed')
  const operator = await findUserByEmail(OPERATOR)
  if (!operator) throw new Error(`${OPERATOR} not found`)

  // ---- team, agents
  const team = await insert(teams, { name: 'Test Team', type: 'public', createdBy: operator.id })
  const staff = await createAppUser({ email: 'testing-staff@test.com', password: PASSWORD, fullName: 'Test Staff', firstName: 'Test', lastName: 'Staff', role: 'staff', status: 'active', isEmailVerified: true, skills: ['Laravel', 'SEO'] })
  const manager = await createAppUser({ email: 'testing-manager@test.com', password: PASSWORD, fullName: 'Test Manager', firstName: 'Test', lastName: 'Manager', role: 'manager', status: 'active', isEmailVerified: true, skills: ['Wordpress'] })
  await insert(teamMembers, { teamId: team.id, userId: staff.id, role: 'member' })
  await insert(teamMembers, { teamId: team.id, userId: manager.id, role: 'lead' })
  await insert(teamMembers, { teamId: team.id, userId: operator.id, role: 'member' })

  // ---- SLA targets (minutes): per ticket type, and a faster one for the test company's support tickets
  const types = new Map((await find(ticketTypes, {})).map((t) => [t.slug, t]))
  const sla: Record<string, [number | null, number | null]> = { support: [60, 1440], bug: [120, 2880], task: [240, 4320], feature: [null, 10080] }
  for (const [slug, [respond, resolve]] of Object.entries(sla)) {
    const t = types.get(slug)
    if (t) await update(ticketTypes, t.id, { slaRespondMinutes: respond, slaResolveMinutes: resolve })
  }
  const typeId = (slug: string) => types.get(slug)?.id ?? null

  // ---- company and its users
  const company = await insert(companies, {
    name: 'Test Company',
    email: 'hello@test-company.test',
    isActive: true,
    isCustomer: true,
    activeTeamId: team.id,
    defaultHourlyRate: 150000,
    defaultRateCurrency: 'IDR',
    slaByType: types.get('support') ? { [String(typeId('support'))]: { respond: 30, resolve: 720 } } : null,
  })
  const clients = []
  for (const [i, [email, first, last]] of ([
    ['testing-client-admin@test.com', 'Citra', 'Pratama'],
    ['testing-client1@test.com', 'Dewi', 'Lestari'],
    ['testing-client2@test.com', 'Rizky', 'Maulana'],
  ] as const).entries()) {
    const u = await createAppUser({ email, password: PASSWORD, fullName: `${first} ${last}`, firstName: first, lastName: last, role: 'customer', status: 'active', isEmailVerified: true, companyId: company.id })
    await insert(companyUsers, { companyId: company.id, userId: u.id, companyRole: i === 0 ? 'company_admin' : 'member' })
    clients.push(u)
  }

  // ---- two contacts without a company
  const contacts = []
  for (const [email, first, last] of [
    ['testing-contact1@test.com', 'Bambang', 'Sutrisno'],
    ['testing-contact2@test.com', 'Laila', 'Hartono'],
  ] as const) {
    contacts.push(await createAppUser({ email, password: PASSWORD, fullName: `${first} ${last}`, firstName: first, lastName: last, role: 'customer', status: 'active', isEmailVerified: true, contactKind: 'person' }))
  }

  // ---- tickets
  type Spec = { title: string; body: string; type: string; status: string; age: number; hour?: number; replyMin: number | null; closeHours?: number; rating?: [number, string | null]; fixed?: number; hourly?: boolean; by: number; assignee: 'staff' | 'manager'; reply?: string }
  const specs: Spec[] = [
    { title: 'Website contact form sends no email', body: 'Messages from the contact form never reach our inbox since last week.', type: 'bug', status: 'closed', age: 26, replyMin: 40, closeHours: 30, rating: [5, 'Fixed quickly, thanks!'], hourly: true, by: 0, assignee: 'staff', reply: 'Found it: the mail settings were reset after the update. Fixed and tested.' },
    { title: 'Update homepage banner for the Ramadan promo', body: 'Please replace the homepage banner with the attached promo and add the countdown.', type: 'task', status: 'closed', age: 24, replyMin: 95, closeHours: 50, rating: [4, null], fixed: 1500000, by: 1, assignee: 'manager', reply: 'Banner and countdown are live. Let us know if the timing needs a tweak.' },
    { title: 'Cannot reset my password', body: 'The reset link says it has expired right after I click it.', type: 'support', status: 'closed', age: 21, replyMin: 25, closeHours: 6, rating: [5, 'Very helpful.'], hourly: true, by: 2, assignee: 'staff', reply: 'We sent a fresh link and cleared the old requests. Please try again.' },
    { title: 'Invoice question for September', body: 'Why is there a line for hosting twice on the September invoice?', type: 'support', status: 'closed', age: 19, replyMin: 75, closeHours: 20, rating: [2, 'Too slow to get an answer.'], hourly: true, by: 0, assignee: 'manager', reply: 'You are right, one of the lines was a duplicate. A corrected invoice is on its way.' },
    { title: 'Add a WhatsApp chat button to the site', body: 'We want a floating WhatsApp button on every page, linked to our business number.', type: 'feature', status: 'closed', age: 16, replyMin: 300, closeHours: 150, rating: [4, null], fixed: 2500000, by: 1, assignee: 'staff', reply: 'The button is live on all pages. It opens a chat with your business number.' },
    { title: 'Checkout page error on mobile', body: 'On phones the checkout shows a blank page after choosing the payment method.', type: 'bug', status: 'closed', age: 12, replyMin: 30, closeHours: 100, rating: [3, 'Needed two rounds before it worked.'], hourly: true, by: 2, assignee: 'staff', reply: 'We can reproduce it on Android and are working on a fix.' },
    { title: 'SEO audit for the product pages', body: 'Could you check titles, descriptions and speed of our top 20 product pages?', type: 'task', status: 'working_team', age: 9, replyMin: 60, hourly: true, by: 0, assignee: 'staff', reply: 'Started. The first findings will follow in a few days.' },
    { title: 'Newsletter template redesign', body: 'We would like a new newsletter template that matches the new brand colours.', type: 'task', status: 'client_review', age: 6, replyMin: 120, by: 1, assignee: 'manager', reply: 'The first design is ready. Please review it and share your feedback.' },
    { title: 'Admin dashboard is very slow', body: 'Opening the orders page in the admin takes more than 20 seconds now.', type: 'bug', status: 'working_team', age: 4, replyMin: 50, hourly: true, by: 2, assignee: 'staff', reply: 'We are profiling the orders query; a fix is planned this week.' },
    { title: 'How do I add a new user?', body: 'I need to give a new colleague access to the portal. Where do I do that?', type: 'support', status: 'open', age: 1, hour: 10, replyMin: 20, by: 0, assignee: 'manager', reply: 'Open My company, then Team, and use Add user. Tell us if you get stuck.' },
    { title: 'Logo not showing in our email signature', body: 'The logo in our email signature appears as a broken image for some people.', type: 'support', status: 'open', age: 0, hour: 5, replyMin: null, by: 1, assignee: 'staff' },
    { title: 'Request: export orders to CSV', body: 'It would help our finance team to export all orders of a month as a CSV file.', type: 'feature', status: 'open', age: 2, replyMin: null, by: 2, assignee: 'manager' },
  ]

  const agentOf = { staff, manager }
  const closedTickets: number[] = []
  let rank = 1
  for (const s of specs) {
    const client = clients[s.by]
    const createdAt = ago(s.age, s.hour ?? 9)
    const repliedAt = s.replyMin != null ? plus(createdAt, s.replyMin) : null
    const closedAt = s.closeHours != null ? plus(createdAt, s.closeHours * 60) : null
    const agent = agentOf[s.assignee]
    const t = await insert(tickets, {
      title: s.title,
      description: `<p>${s.body}</p>`,
      createdBy: client.id,
      contactUserId: client.id,
      companyId: company.id,
      teamId: team.id,
      status: s.status,
      ticketType: 'support',
      typeId: typeId(s.type),
      createdVia: s.by === 0 ? 'email' : 'portal',
      priority: s.status === 'closed' ? null : rank++,
      hourlyRate: s.hourly ? 150000 : null,
      fixedPrice: s.fixed ?? null,
      rateCurrency: s.hourly || s.fixed ? 'IDR' : null,
      firstRespondedAt: repliedAt,
      csatRating: s.rating?.[0] ?? null,
      csatComment: s.rating?.[1] ?? null,
      csatAt: closedAt && s.rating ? plus(closedAt, 120) : null,
      csatBy: s.rating ? client.id : null,
      createdAt,
      updatedAt: closedAt ?? repliedAt ?? createdAt,
    })
    await insert(ticketAssignees, { ticketId: t.id, userId: agent.id })
    await insert(ticketComments, { ticketId: t.id, userId: client.id, comment: `<p>${s.body}</p>`, visibility: 'reply', authorType: 'customer', createdAt })
    if (repliedAt && s.reply) await insert(ticketComments, { ticketId: t.id, userId: agent.id, comment: `<p>${s.reply}</p>`, visibility: 'reply', authorType: 'agent', createdAt: repliedAt })
    if (s.status === 'closed') closedTickets.push(t.id)

    // worked hours, a few sessions after the ticket was opened (so each lands in the invoice window of its ticket)
    if (s.hourly) {
      const jobs = (await find(jobTypes, {})).filter((j) => j.billable !== false).map((j) => j.slug)
      for (const [i, hours] of [3, 2, 1.5].entries()) {
        const day = Math.max(s.age - 1 - i, 0)
        const start = ago(day, 10 + i * 2)
        await insert(ticketTimeTracker, { ticketId: t.id, userId: agent.id, trackerType: 'manual', jobType: jobs[i % jobs.length] ?? 'execution', startTime: start, stopTime: plus(start, hours * 60), durationSeconds: Math.round(hours * 3600) })
      }
    }
  }

  // ---- two tickets from people without a company
  for (const [i, [title, body, age]] of ([
    ['Partnership inquiry', 'Hello, we run an agency and would like to talk about working together.', 3],
    ['Cannot unsubscribe from your newsletter', 'I click unsubscribe but I keep receiving the newsletter.', 1],
  ] as const).entries()) {
    const c = contacts[i]
    const createdAt = ago(age, 14)
    const t = await insert(tickets, { title, description: `<p>${body}</p>`, createdBy: c.id, contactUserId: c.id, status: 'open', ticketType: 'support', typeId: typeId('support'), createdVia: 'email', priority: rank++, createdAt, updatedAt: createdAt })
    await insert(ticketComments, { ticketId: t.id, userId: c.id, comment: `<p>${body}</p>`, visibility: 'reply', authorType: 'customer', createdAt })
  }

  // ---- billing: three invoices (the oldest is paid), and a deposit
  const issue = (age: number) => dayjs().subtract(age, 'day').format('YYYY-MM-DD')
  const inv1 = await createInvoice({ companyId: company.id, from: issue(30), to: issue(18), currency: 'IDR', issueDate: issue(17), dueDate: issue(3), notes: null, createdBy: operator.id })
  await payInvoice(inv1.id, 'payment', operator.id, 'BCA-TRF-0001')
  await createInvoice({ companyId: company.id, from: issue(17), to: issue(8), currency: 'IDR', issueDate: issue(7), dueDate: issue(2), notes: 'Please pay within 5 days.', createdBy: operator.id })
  await createInvoice({ companyId: company.id, from: issue(7), to: issue(0), currency: 'IDR', issueDate: issue(0), dueDate: dayjs().add(14, 'day').format('YYYY-MM-DD'), notes: null, createdBy: operator.id })
  await insert(companyPayments, { companyId: company.id, amount: 3000000, currency: 'IDR', paidAt: ago(10), reference: 'Deposit', note: 'Prepaid deposit', createdBy: operator.id })

  // the stored daily SLA summaries were built before these tickets existed
  await fdb().recursiveDelete(fdb().collection('sla_daily'))

  const all = await find(users, {})
  console.log(`Done. ${specs.length + 2} tickets (${closedTickets.length} finished and rated), 3 invoices, ${all.length} accounts. Password for the new accounts: ${PASSWORD}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
