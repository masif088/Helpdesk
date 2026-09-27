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
| Storage | iDrive e2 (S3-compatible) / local |
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
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

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
STORAGE_PROVIDER=local   # local | idrive

# Only required when STORAGE_PROVIDER=idrive
IDRIVE_E2_ENDPOINT="https://..."
IDRIVE_E2_ACCESS_KEY="..."
IDRIVE_E2_SECRET_KEY="..."
IDRIVE_E2_BUCKET="your-bucket"
IDRIVE_E2_REGION="us-east-1"
IDRIVE_E2_PUBLIC_URL="https://public-url/bucket"
```

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
COMPANY_DAILY_ACTIVE_CRON_SECRET="your-secret-here"   # falls back to SYNC_INBOX_CRON_SECRET
```

### App

```env
NEXT_PUBLIC_APP_NAME="DeskTeam360"         # fallback navbar title (overridden by Settings → App Branding)
NEXT_PUBLIC_APP_DESCRIPTION="..."
TICKETS_LOOKUP_CATALOG_REVALIDATE_SECONDS=3600
```

---

## Database (Firestore)

Every former Postgres table is a top-level Firestore collection with the same name (`tickets`, `users`,
`ticket_comments`, …). Field names are camelCase exactly as the row objects in code. Collections, types and
default values are defined in `lib/fsdb/schema.ts`; queries go through the helpers in `lib/fsdb/ops.ts`
(`get`, `find`, `insert`, `update`, `upsert`, `remove`, …). There are no schema migrations — new fields are
added in `schema.ts` and default to `null` on old documents.

- **Ids:** uuid tables keep uuid ids; integer tables (tickets, statuses, types, priorities, automation rules,
  project statuses) take the next value from `_counters/{collection}`.
- **Relations:** Firestore has no foreign keys. Deletes that used to cascade go through `lib/fsdb/cascade.ts`.
- **Search:** tickets, comments, users and companies store keyword arrays (`kwTitle`, `kwDescription`,
  `kwComment`, `searchKeywords`) — search matches whole words and word prefixes.
- **Indexes & rules:** `firestore.indexes.json` and `firestore.rules`. Deploy with
  `npm run firebase:deploy-firestore`. A query whose composite index is missing still works (it falls back to
  in-memory filtering) and logs a `[fsdb] … missing composite index` warning with the link to create it.

### First setup

```bash
npm run db:seed          # statuses, types, priorities, job types + first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
```

### Importing the old Postgres data

```bash
DATABASE_URL="postgresql://…" npm run migrate:firestore -- --dry-run   # counts only
DATABASE_URL="postgresql://…" npm run migrate:firestore
```

Copies every table into Firestore with the same ids, rebuilds search fields, sets the id counters, and imports
all users into Firebase Auth with their existing bcrypt hashes (everyone keeps their current password).
Safe to re-run.

---

## Cron Jobs

All cron jobs run on the Lightsail server (`ubuntu@3.23.67.169`) via `crontab`.
Auth uses `Authorization: Bearer <secret>` from `.env`.

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/email/sync-inbox` | Every 2 min | Sync Gmail inbox → create tickets from incoming email |
| `POST /api/cron/process-recurring-tickets` | Every 1 min | Create tickets from due recurring rules |
| `POST /api/cron/company-daily-active` | Daily 00:05 UTC | Snapshot daily active assignment per company |

### Crontab entries

```cron
# Email inbox sync — every 2 minutes
*/2 * * * * curl -s -X POST https://ticket.deskteam360.com/api/email/sync-inbox \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-sync-inbox.log 2>&1

# Process recurring tickets — every minute
* * * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/process-recurring-tickets \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-recurring.log 2>&1

# Company daily active snapshot — every day at 00:05 UTC
5 0 * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/company-daily-active \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-company-daily.log 2>&1

```

### View / edit crontab on server

```bash
ssh -i "~/LightsailDefaultKey-us-east-2.pem" ubuntu@3.23.67.169
crontab -l    # view
crontab -e    # edit
```

### Check logs

```bash
tail -f /var/log/dt-labs-sync-inbox.log
tail -f /var/log/dt-labs-recurring.log
tail -f /var/log/dt-labs-company-daily.log
```

### Adding a new cron job

1. Create endpoint at `app/api/cron/<name>/route.ts`
2. Add auth check using `SYNC_INBOX_CRON_SECRET` (or create a new secret in `.env`)
3. Register on server via `crontab -e`
4. Add a log file path and update the table above

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

When `firestore.indexes.json` or `firestore.rules` change, deploy them with `npm run firebase:deploy-firestore`.

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
