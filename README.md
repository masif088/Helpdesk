# DeskTeam360

Helpdesk & ticketing platform built with Next.js 16 App Router, Cloud Firestore and Firebase Authentication.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Cloud Firestore via Firebase Admin SDK (`lib/fsdb`) |
| Auth | Firebase Authentication — email/password, session cookie |
| Email | Gmail OAuth2 (`googleapis`) |
| Storage | Firebase Storage / local |
| Realtime | Firebase (presence + notifications) |
| AI | OpenAI Platform or Codex proxy (switchable) |

---

## Environment Variables

Copy `.env` and fill in the values.

### Required

```env
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"
# + the Firebase variables below (Admin SDK + Web API key are required for login and data)
```

### Email (Gmail OAuth2)

Configured via **Settings → Email Integration** in the app UI. OAuth tokens are stored in the `email_integrations` table. The env vars below are required for the OAuth flow:

```env
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
# Shared secret for scheduled jobs (email sync, recurring tickets); Cloud Scheduler sends it as a Bearer token
SYNC_INBOX_CRON_SECRET="..."
```

Create the OAuth client in Google Cloud Console → APIs & Services → Credentials → *OAuth client ID*
(type *Web application*), enable the **Gmail API**, and add this authorized redirect URI:
`<NEXT_PUBLIC_SITE_URL>/api/email/google/callback` (e.g. `http://localhost:3000/api/email/google/callback` for local).
Then connect the mailbox in Settings → Email Integration.

### AI (Summarize & Reply)

AI config is loaded from the database first (via **Settings → AI Integration**), falling back to env vars:

```env
# Provider: openai | codex
AI_PROVIDER=openai

# OpenAI Platform
OPENAI_API_KEY="sk-proj-..."
OPENAI_BASE_URL="https://api.openai.com/v1"   # optional, this is the default
OPENAI_MODEL="gpt-4o-mini"                     # optional, this is the default

# Codex (ChatGPT Pro proxy) — only if AI_PROVIDER=codex
CODEX_API_KEY="dummy"
CODEX_BASE_URL="http://your-proxy-server/v1"
CODEX_MODEL="gpt-5.4"
```

> **Priority:** Active DB preset (Settings → AI Integration) overrides env vars.
> If no DB preset is active, env vars are used.
> Roles that can access AI settings: `admin`, `staff`.

### Storage

```env
STORAGE_PROVIDER=firebase   # firebase (default) | local

# Optional: bucket name, defaults to NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
# FIREBASE_STORAGE_BUCKET="my-project.firebasestorage.app"
```

Uploads go to **Firebase Storage** through the Admin SDK (same service account as Firestore). Files are served
from the Firebase download URL; `storage.rules` allows public read and blocks client writes — deploy it with
`npm run firebase:deploy-rules`. `local` stores files under `./storage-data` and serves them via `/api/storage/file`.

### Firebase (Auth, Firestore, Realtime)

```env
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."
NEXT_PUBLIC_FIREBASE_VAPID_KEY="..."   # for Web Push (FCM)

FIREBASE_PROJECT_ID="..."
FIREBASE_CLIENT_EMAIL="..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Optional: send the session cookie without `Secure` (plain http, e.g. VPS by IP). Auto-detected by default.
# AUTH_COOKIE_SECURE=false

# Dev only: log every Firestore round trip with its duration ([fsdb] get tickets/12 85ms)
# FSDB_TRACE=1
```

In the Firebase console enable **Authentication → Sign-in method → Email/Password** and create a **Firestore** database (Native mode).

Local development can run against the emulators instead of a real project:

```bash
npx firebase-tools emulators:start --only firestore,auth --project demo-deskteam
```

```env
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_PROJECT_ID=demo-deskteam
NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key
```

### Cron Secrets

```env
SYNC_INBOX_CRON_SECRET="your-secret-here"
```

### App

```env
# Branding (lib/branding.ts). Settings → App Branding overrides name / logo / favicon when filled in.
NEXT_PUBLIC_APP_NAME="Helpdesk"                 # sidebar, top navbar, emails, print/export
NEXT_PUBLIC_APP_TITLE="Helpdesk — Client Support" # browser tab + share title (default: app name)
NEXT_PUBLIC_APP_DESCRIPTION="Ticketing and client support"
NEXT_PUBLIC_APP_LOGO="brand/logo.svg"           # relative → public/brand/logo.svg; or a full https:// URL
NEXT_PUBLIC_APP_FAVICON="brand/favicon.png"     # relative → public/…; or a full URL (default: generated icon with the app initial)
TICKETS_LOOKUP_CATALOG_REVALIDATE_SECONDS=3600
```

`NEXT_PUBLIC_*` values are baked in at build time — rebuild (`npm run build`) after changing them.

---

## Database (Firestore)

Every former Postgres table is a top-level Firestore collection with the same name (`tickets`, `users`,
`ticket_comments`, …). Field names are camelCase exactly as the row objects in code. Collections, types and
default values are defined in `lib/fsdb/schema.ts`; queries go through the helpers in `lib/fsdb/ops.ts`
(`get`, `find`, `insert`, `update`, `upsert`, `remove`, …). There are no schema migrations — new fields are
added in `schema.ts` and default to `null` on old documents.

- **Ids:** uuid tables keep uuid ids; integer tables (tickets, statuses, types, automation rules,
  project statuses) take the next value from `_counters/{collection}`.
- **Relations:** Firestore has no foreign keys. Deletes that used to cascade go through `lib/fsdb/cascade.ts`.
- **Search:** tickets, comments, users and companies store keyword arrays (`kwTitle`, `kwDescription`,
  `kwComment`, `searchKeywords`) — search matches whole words and word prefixes.
- **Indexes & rules:** `firestore.indexes.json` and `firestore.rules`. Deploy with
  `npm run firebase:deploy-rules`. A query whose composite index is missing still works (it falls back to
  in-memory filtering) and logs a `[fsdb] … missing composite index` warning with the link to create it.

### First setup

```bash
npm run db:seed          # statuses, types, job types + first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
```

---

## Scheduled jobs

Firebase App Hosting has no crontab: an external scheduler — **Google Apps Script** triggers (free) or
**Google Cloud Scheduler** — calls the job endpoints over HTTP with `Authorization: Bearer <SYNC_INBOX_CRON_SECRET>`.

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/email/sync-inbox` | every 5 min | Sync Gmail inbox → create tickets from incoming email |
| `POST /api/cron/process-recurring-tickets` | every 5 min | Create tickets from due recurring rules |
| `POST /api/automation/time-trigger` | daily 06:00 | Time Trigger automation rules (each fires once per idle period) |

Setup (Apps Script code in [docs/apps-script-scheduler.gs](docs/apps-script-scheduler.gs)), logs and
troubleshooting: [docs/cron-jobs.md](docs/cron-jobs.md).
Deploy config (env values and Secret Manager secrets): [apphosting.yaml](apphosting.yaml).

---

## AI — Summarize & Reply Template

The AI feature powers:
- **Ticket summarization** — summarize the ticket thread for agents
- **Agent reply template** — pre-fill a draft reply based on ticket context (`template_agent_reply`)

### Configuration priority

```
Settings → AI Integration (DB preset, isActive = true)
    ↓ fallback if none active
Environment variables (AI_PROVIDER, OPENAI_API_KEY, etc.)
```

### Providers

**OpenAI Platform** (default)
- Requires `OPENAI_API_KEY`
- Default model: `gpt-4o-mini`
- Default base URL: `https://api.openai.com/v1`

**Codex** (ChatGPT Pro proxy)
- Set `AI_PROVIDER=codex`
- Requires `CODEX_BASE_URL` pointing to your proxy
- `CODEX_API_KEY` can be `"dummy"` if proxy handles auth
- Default model: `gpt-5.4`

### Managing from UI

Go to **Settings → AI Integration** to add/switch presets without redeploying.
Only one preset can be active at a time — activating one deactivates all others.

---

## Deployment

```bash
git push origin main
```

GitHub push triggers CI/CD automatically — build + restart on the server.

When `firestore.indexes.json`, `firestore.rules` or `storage.rules` change, deploy them with `npm run firebase:deploy-rules`.

---

## Key Developer Notes

### Auth & Roles

- **Firebase Authentication** verifies email + password (`POST /api/auth/session`), then the server sets a
  Firebase **session cookie** (`__session`, 14 days). `auth()` in `auth.ts` verifies it and loads the `users`
  document (uid = `users.id`). Client code uses `useSession` / `signIn` / `signOut` from `lib/auth-client.tsx`.
- Users are created with `createAppUser()` (`lib/app-users.ts`), which writes the `users` document and the Auth
  account together; passwords are set with `setUserPassword()` — no password hashes are stored in Firestore.
- `middleware.ts` only checks that a session cookie exists (Edge); real verification happens in `auth()`.
- Roles: `admin`, `staff`, `customer`. Most API routes gate on `session.user.role`.
- `mustChangePassword` on the user — the `(auth)` layout redirects to `/change-password` if set. Cleared automatically on successful password change.

### Email Templates

- Templates stored in `message_templates` table, edited via **Settings → Message Templates**.
- Placeholders use `{{ key }}` syntax, replaced at send time by `mergeMessageTemplateHtml()` in `lib/message-template-merge.ts`.
- Keys listed in `allMessageTemplatePlaceholderKeys()` go through `replaceOfficialKey`. Context-specific keys (`temporary_password`, `reply_content`, etc.) must be passed via the `extra` parameter.
- Email sender display name is set in **Settings → App Branding → Email Sender Name**.

### App Settings

Stored in the `app_settings` table (key-value), accessed via `lib/app-settings.ts`.

| Key | Description |
|---|---|
| `app_name` | App name shown in the navbar |
| `app_logo_url` | Logo image URL |
| `app_favicon_url` | Favicon URL |
| `email_sender_name` | Display name for outgoing emails, e.g. `"DeskTeam360 Support"` |

### Import Order

ESLint enforces `simple-import-sort`. Imports within `@/lib/*` must be alphabetical. Run `npx eslint --fix` to auto-sort.

### Firebase

Firebase is the whole backend: **Firestore** (all data, via Admin SDK on the server), **Authentication** (login),
realtime presence / ticket sync (client listeners) and **push notifications** (FCM). Browsers never read app data
from Firestore directly — the rules only allow the realtime helper paths.
