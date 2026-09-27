# Scheduled jobs

Firebase App Hosting has no crontab. Scheduled work is triggered by **Google Cloud Scheduler**, which
sends an HTTP POST to the app on a schedule. Every job endpoint checks a shared secret:

```
env var: SYNC_INBOX_CRON_SECRET   (CRON_SECRET is accepted as a legacy alias)
header:  Authorization: Bearer <value>     (x-api-key / x-cron-secret also work)
```

The check lives in `lib/cron-auth.ts`.

## Jobs

| Job name | Endpoint | Schedule | Purpose |
|---|---|---|---|
| `sync-inbox` | `POST /api/email/sync-inbox` | every 2 minutes | Read new Gmail messages → create tickets / add replies |
| `recurring-tickets` | `POST /api/cron/process-recurring-tickets` | every minute | Create tickets from recurring rules that are due |

`POST /api/automation/time-trigger` (automation rules with a time trigger) uses the same secret but is
**not scheduled**: it runs every matching rule on every call, so schedule it only once you have decided how
often those rules may fire.

Cloud Scheduler pricing: 3 jobs per billing account are free, then $0.10 per job per month.

## One-time setup

Replace `PROJECT_ID`, `APP_URL` (the App Hosting URL or your custom domain, no trailing slash) and the secret.
Region: use the same region as the backend (the Firestore database is in `asia-southeast1`).

1. Create the secret once (App Hosting reads it from Secret Manager, see `apphosting.yaml`):

```bash
firebase apphosting:secrets:set SYNC_INBOX_CRON_SECRET --project PROJECT_ID
```

   A good value: `openssl rand -hex 32`. Use the same value in the jobs below.

2. Enable Cloud Scheduler:

```bash
gcloud services enable cloudscheduler.googleapis.com --project PROJECT_ID
```

3. Create the jobs:

```bash
gcloud scheduler jobs create http sync-inbox --project PROJECT_ID --location asia-southeast1 --schedule "*/2 * * * *" --time-zone "Asia/Jakarta" --http-method POST --uri "APP_URL/api/email/sync-inbox" --headers "Authorization=Bearer SECRET" --attempt-deadline 300s
```

```bash
gcloud scheduler jobs create http recurring-tickets --project PROJECT_ID --location asia-southeast1 --schedule "* * * * *" --time-zone "Asia/Jakarta" --http-method POST --uri "APP_URL/api/cron/process-recurring-tickets" --headers "Authorization=Bearer SECRET" --attempt-deadline 120s
```

The same can be done in Google Cloud Console → Cloud Scheduler → Create job (target type HTTP, method POST,
add the `Authorization` header).

## Operate

Run a job now (e.g. after deploying):

```bash
gcloud scheduler jobs run sync-inbox --project PROJECT_ID --location asia-southeast1
```

Pause / resume:

```bash
gcloud scheduler jobs pause sync-inbox --project PROJECT_ID --location asia-southeast1
```

```bash
gcloud scheduler jobs resume sync-inbox --project PROJECT_ID --location asia-southeast1
```

Change the secret: update it with `firebase apphosting:secrets:set`, roll out the backend, then update each job:

```bash
gcloud scheduler jobs update http sync-inbox --project PROJECT_ID --location asia-southeast1 --update-headers "Authorization=Bearer NEW_SECRET"
```

Logs:
- Job runs and HTTP status: Cloud Console → Cloud Scheduler → job → *View logs*.
- What the endpoint did (tickets created, errors): Firebase console → App Hosting → backend → *Logs*.

A `401` means the secret in the job does not match `SYNC_INBOX_CRON_SECRET`. A `503` from `sync-inbox`
means Gmail is not connected yet (Settings → Email Integration) or `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
is missing.

## Local development

No scheduler runs locally. Trigger a job by hand:

```bash
curl -X POST http://localhost:3000/api/email/sync-inbox -H "Authorization: Bearer $SYNC_INBOX_CRON_SECRET"
```

Or use the **Sync inbox** button in Settings → Email Integration.

## Adding a job

1. Create the endpoint at `app/api/cron/<name>/route.ts` and start it with `if (!isCronRequest(req)) return 401`.
2. Create a Cloud Scheduler job for it (step 3 above).
3. Add it to the table in this document.
