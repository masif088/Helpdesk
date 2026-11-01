# Helpdesk

**An open-source helpdesk for small businesses.** Your clients open tickets in a portal (or just send an email), your team
works them on a board, and the app keeps an eye on response times, billing and client satisfaction. No monthly
subscription, no per-seat fee: you run it on **your own Google account** and pay only for what you really use.

> **Open for discussion and building together.** This project is developed in the open. Ideas, bug reports, questions
> and pull requests are all welcome, and you do not need to be an expert. See [Contributing](#contributing).

**Jump to:** [Why this exists](#why-this-exists) · [What it does](#what-it-does) · [Quick start](#quick-start) ·
[Firebase setup](#firebase-setup-step-by-step) · [Deployment](#deployment) · [Contributing](#contributing)

---

## Why this exists

Most business software is priced per user, per month, forever. For a small shop, agency or service team that adds up
fast, and it is often the reason "let's finally get organised" never happens.

I build tools so a small business can **go digital without paying for a pile of expensive subscriptions**. Everything I
make runs on Google tools you may already use:

| Google tool | What it does here |
|---|---|
| **Firebase** (Firestore + Authentication) | The database and the login |
| **Google Apps Script** | Scheduled jobs and automation, for free |
| **Gmail** | Incoming and outgoing email |
| **Firebase App Hosting** | Runs the app (optional, any Node host works too) |

**What does it cost?** Nothing to me, and no license fee. You pay your own Google usage under your own account, which for
a small team is usually very little (see [which Firebase plan](#firebase-setup-step-by-step) you need). Your data stays
in your own project, so you can leave at any time.

**Who is it for?** Small teams that answer client requests: agencies, IT and service shops, freelancers with a few
clients, internal support desks. If you can follow a step-by-step guide, you can run it.

---

## What it does

**For the support team**
- **Tickets** with statuses, types, tags, priorities, assignees, checklists, attachments, internal notes and a full
  activity history. Board (Kanban) and list views.
- **Email in, email out.** Connect a Gmail mailbox: incoming mail becomes tickets, replies go back by email, and the
  app never auto-answers bulk, bounce or no-reply mail.
- **Smart assignment.** Skills per agent and per ticket, a recommended assignee, auto-assign by skill match, and a
  workload report.
- **Automation.** Rules that fire on ticket events or after idle time, recurring tickets, canned responses with
  placeholders, message templates, Slack alerts.
- **AI help** (optional, bring your own key): ticket summaries and draft replies.
- **Team activity.** See who worked in any period (days or hours): time tracked, tickets worked on, open load, leave and meetings, filterable by person, client company, skill and ticket type (see [docs/api.md](docs/api.md)).
- **Calendar.** Meetings, leave, holidays, events, training and maintenance windows, plus ticket and invoice due dates, in one calendar with repeating events (see [docs/calendar.md](docs/calendar.md)).
- **Time tracking and billing.** Job types, billable hours, monthly retainer invoices, deposits, and online payment of
  invoices through Midtrans or Xendit.

**For clients**
- **A portal** with their company's tickets, billing and a "rate your tickets" page.
- **Rate a ticket in one tap** from the closing email, no login needed (signed links).
- **API keys, an API builder and a skill file** so a client's own AI assistant can find tickets (by date, company, person, skill, type and more), open and comment on them, and read the calendar (see [docs/api.md](docs/api.md)).

**Service levels and reports**
- **SLA** per client and ticket type, with clocks that stop while the ball is with the client, optional business
  hours and holidays, and alerts in the bell and in Slack.
- **Reports:** support volume, SLA, satisfaction (CSAT), workload and billing.

**Everything else**
- Installable on a phone (PWA) with a mobile view, push notifications, light and dark theme.
- A guided **first-run setup**: open a new installation and it asks you to name the app and create the first admin.
- A **demo reset** with a manual safety lock, for people who demo the app.

---

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router), React 19, Ant Design |
| Database | Cloud Firestore via the Firebase Admin SDK (`lib/fsdb`) |
| Auth | Firebase Authentication: email and password, session cookie |
| Email | Gmail OAuth2 (`googleapis`) |
| Storage | Firebase Storage, or local disk |
| Realtime | Firebase (presence and notifications) |
| AI | OpenAI Platform or a Codex proxy (switchable, optional) |
| Hosting | Firebase App Hosting (any Node host works) |

---

## Quick start

You need **Node.js 22+** and a **Firebase project** (the free Spark plan is enough for local development; Firebase App Hosting needs the pay-as-you-go Blaze plan).

```bash
git clone https://github.com/masif088/asif-labs.git
cd asif-labs
npm install
cp .env.example .env.local      # then fill in the Firebase values (the file explains each one)
npm run dev
```

Set up the Firebase project first, see [Firebase setup, step by step](#firebase-setup-step-by-step).
Open <http://localhost:3000>: on a new database it sends you to `/setup`, where you name the app and create the first
admin. That is all; the starting data (statuses, ticket types, job types, message templates) is created for you.

Prefer the terminal? `npm run db:seed` does the same with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
To try it without a real project, use the Firebase emulators (see the bottom of [.env.example](.env.example)).

Useful commands:

```bash
npm run dev            # development server
npm run lint           # ESLint
npx tsc --noEmit       # type check
npm test               # unit tests (Node's built-in test runner)
npm run build          # production build
```

---

## Firebase setup, step by step

Firebase is the whole backend, so this is the one thing to set up before the app can run.

**Which plan?** The free **Spark** plan is enough to run and develop the app on your own computer. To deploy it on
**Firebase App Hosting** you need the pay-as-you-go **Blaze** plan: App Hosting, its Secret Manager, and (since 2026,
according to Firebase's pricing) Cloud Storage are only available on Blaze. Blaze keeps the same free quotas as Spark, so
a small installation can still cost nothing, but a billing account must be attached. **Set a budget alert** (Google Cloud
Console → Billing → Budgets & alerts) so a surprise can never become a big bill. Plans and prices change; check
[firebase.google.com/pricing](https://firebase.google.com/pricing).

| Service | Used for | Plan |
|---|---|---|
| Authentication (Email/Password) | Sign-in and sessions | Spark is enough |
| Firestore (Native mode) | All the data | Spark is enough within the daily quotas |
| Cloud Storage | Ticket attachments and uploads | Blaze |
| App Hosting + Secret Manager | Build and run the app from GitHub, keep its secrets | Blaze |
| Cloud Messaging | Push notifications | Free |

No Blaze plan? Run the app on your own computer or any Node server with `STORAGE_PROVIDER=local` (files are kept on disk).

1. **Create a project** at <https://console.firebase.google.com>.
2. **Upgrade to Blaze** (only needed to deploy on App Hosting or to use Cloud Storage) and set the budget alert above.
3. **Authentication** → *Get started* → *Sign-in method* → enable **Email/Password**.
4. **Firestore Database** → *Create database* → **Native mode**, pick a region close to your users (it cannot be changed later).
5. **Storage** → *Get started* (skip this if you use `STORAGE_PROVIDER=local`).
6. **Web app:** Project settings → *General* → *Your apps* → add a **Web app**. Copy its config into the
   `NEXT_PUBLIC_FIREBASE_*` values of `.env.local`.
7. **Service account:** Project settings → *Service accounts* → *Generate new private key*. Copy `project_id`,
   `client_email` and `private_key` from the downloaded JSON into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
   `FIREBASE_PRIVATE_KEY`. Treat this file like a password and never commit it.
8. **Deploy the rules and indexes:** `npm run firebase:deploy-rules` (log in first with `npx firebase-tools login`).
9. **Push notifications (optional):** Project settings → *Cloud Messaging* → *Web Push certificates* → generate a key pair
   and put the public key in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
10. **Run it:** `npm run dev` and open <http://localhost:3000>. A new database opens `/setup` to create the first admin.

**Deploying on Firebase App Hosting**

1. Firebase console → *App Hosting* → *Get started* → connect your GitHub repository and choose the live branch.
2. Put the public values (the `NEXT_PUBLIC_*` ones and the project id) in [apphosting.yaml](apphosting.yaml), replacing the
   ones that are there with your own.
3. Store each secret once: `firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY` (also `GOOGLE_CLIENT_SECRET` and
   `SYNC_INBOX_CRON_SECRET` when you use them), and grant the backend access when the CLI asks.
4. Push to the live branch. Firebase builds and deploys it; open the app URL and finish `/setup`. On a public server
   set `SETUP_TOKEN` first so nobody else can claim the app.
5. Set `NEXT_PUBLIC_SITE_URL` to the app's real address, and set up the scheduler for email sync and SLA alerts
   (see [Scheduled jobs](#scheduled-jobs)).

---

## Configuration

Every variable is listed, with comments, in [.env.example](.env.example). Only the Firebase values and
`NEXT_PUBLIC_SITE_URL` are required; everything else switches on a feature:

| You want | Set |
|---|---|
| Incoming email becomes tickets | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, then connect the mailbox in **Settings → Email Integration** |
| Scheduled jobs (email sync, recurring tickets, SLA alerts) | `SYNC_INBOX_CRON_SECRET` and a scheduler, see [Scheduled jobs](#scheduled-jobs) |
| AI summaries and replies | **Settings → AI Integration**, or `OPENAI_API_KEY` as a fallback |
| Your own name, logo and favicon | `NEXT_PUBLIC_APP_*`, or **Settings → Branding** |
| Push notifications | `NEXT_PUBLIC_FIREBASE_VAPID_KEY` |
| A public server that nobody else may set up first | `SETUP_TOKEN` |

`NEXT_PUBLIC_*` values are baked into the build: rebuild after changing them. Never commit `.env.local`; it is
git-ignored and only `.env.example` is tracked.

Gmail OAuth: create an OAuth client (type *Web application*) in Google Cloud Console, enable the **Gmail API**, and add
the redirect URI `<NEXT_PUBLIC_SITE_URL>/api/email/google/callback`.

AI settings saved in the app (**Settings → AI Integration**) override the environment variables. Only one preset is
active at a time. Supported providers: **OpenAI** (default model `gpt-4o-mini`) and **Codex** proxy
(`AI_PROVIDER=codex`, with `CODEX_BASE_URL`).

Storage: files go to Firebase Storage through the Admin SDK (`storage.rules` allows public read and blocks client
writes). `STORAGE_PROVIDER=local` keeps them under `./storage-data` instead.

---

## First run and the database

**On a new database, just open the app.** With no users yet, `/login` sends you to `/setup`. The page and
`POST /api/setup` stop working as soon as one user exists. On a public server set `SETUP_TOKEN` first; the setup page
then asks for it, so nobody else can claim the app.

Every table is a top-level Firestore collection (`tickets`, `users`, `ticket_comments`, …) with camelCase fields.
Collections, types and defaults are in `lib/fsdb/schema.ts`; queries go through the helpers in `lib/fsdb/ops.ts`.
There are no migrations: a new field is added in `schema.ts` and reads as `null` on old documents.

- **Ids:** uuid tables keep uuid ids; integer tables (tickets, statuses, types, …) take the next value from `_counters/{collection}`.
- **Relations:** Firestore has no foreign keys. Deletes that used to cascade go through `lib/fsdb/cascade.ts`.
- **Search:** tickets, comments, users and companies store keyword arrays, so search matches whole words and prefixes.
- **Indexes and rules:** `firestore.indexes.json`, `firestore.rules` and `storage.rules`. Deploy them with
  `npm run firebase:deploy-rules`. A query whose composite index is missing still works (it filters in memory) and logs
  a warning with the link to create the index.

---

## Scheduled jobs

Firebase App Hosting has no crontab: an external scheduler (**Google Apps Script**, free, or **Google Cloud Scheduler**)
calls the job endpoints over HTTP with `Authorization: Bearer <SYNC_INBOX_CRON_SECRET>`.

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/email/sync-inbox` | every 5 min | Read the Gmail inbox, create tickets and replies |
| `POST /api/cron/process-recurring-tickets` | every 5 min | Create tickets from due recurring rules |
| `POST /api/cron/inbox-reminders` | hourly | Reminders, billing and SLA alerts, monthly retainer invoices |
| `POST /api/automation/time-trigger` | daily 06:00 | Time-trigger automation rules |

The ready-made Apps Script is under **Settings → Scheduled jobs**. Setup, logs and troubleshooting:
[docs/cron-jobs.md](docs/cron-jobs.md).

---

## Deployment

The app is made for **Firebase App Hosting**: connect the GitHub repository in the Firebase console and every push to the
live branch is built and deployed by Firebase. Public values live in [apphosting.yaml](apphosting.yaml); secrets live in
Secret Manager (`firebase apphosting:secrets:set <NAME>`, then name them in `apphosting.yaml`). Replace the Firebase
project values in that file with your own. Any host that runs `npm run build && npm start` works too.

When `firestore.indexes.json`, `firestore.rules` or `storage.rules` change, run `npm run firebase:deploy-rules`.

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, type check and tests on every push and
pull request. It does not deploy.

---

## Contributing

This project is open for discussion and for building together, whatever your level.

- **Have an idea or a question?** Open an issue (or a discussion, if enabled) and describe the problem you want solved.
  Real-life support-desk stories help the most.
- **Found a bug?** Open an issue with the steps to reproduce, what you expected, and what happened.
- **Want to code?** Pick an issue, or something from [docs/future-features.md](docs/future-features.md), and say so
  in the issue first so nobody works twice on the same thing. Then:
  1. Fork, and create a branch from `main`.
  2. Make the change. Keep it focused; follow the surrounding code style.
  3. Run `npm run lint`, `npx tsc --noEmit` and `npm test`. Add a test when you touch logic.
  4. Open a pull request that says what changed and why.

Ground rules: **code, UI text, comments and commit messages are in English** (conversations can be in any language), and
secrets never go into git.

### Developer notes

- **Auth and roles.** Firebase Authentication checks email and password (`POST /api/auth/session`); the server then sets
  a session cookie (`__session`, 14 days). `auth()` in `auth.ts` verifies it and loads the `users` document
  (uid = `users.id`). Roles: `admin`, `manager`, `staff`, `customer`; most API routes gate on `session.user.role`.
  `proxy.ts` only checks that a session cookie exists; real verification happens in `auth()`.
- **Users** are created with `createAppUser()` (`lib/app-users.ts`), which writes the `users` document and the Auth
  account together. No password hashes are stored in Firestore.
- **Email templates** live in `message_templates` (edit in **Settings → Message Templates**). Placeholders use
  `{{ key }}` and are merged by `mergeMessageTemplateHtml()` in `lib/message-template-merge.ts`.
- **App settings** are key-value rows in `app_settings` (`lib/app-settings.ts`): `app_name`, `app_logo_url`,
  `app_favicon_url`, `email_sender_name`, `sla_calendar`, and more.
- **Import order** is enforced by ESLint (`simple-import-sort`). Run `npx eslint --fix` to sort.
- **Firebase is the whole backend:** Firestore (all data, via the Admin SDK on the server), Authentication, realtime
  presence and ticket sync (client listeners) and push notifications (FCM). Browsers never read app data from Firestore
  directly; the rules only allow the realtime helper paths.
- **Demo reset** (Settings → Demo reset) is locked until someone sets `_guards/demo_reset.enabled = true` by hand in
  Firestore, and it locks itself again after one use.
