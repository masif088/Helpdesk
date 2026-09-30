# Scheduled jobs

Firebase App Hosting has no crontab. Scheduled work runs by calling the job endpoints over HTTP from an
external scheduler. Every job endpoint checks a shared secret:

```
env var: SYNC_INBOX_CRON_SECRET   (CRON_SECRET is accepted as a legacy alias)
header:  Authorization: Bearer <value>     (x-api-key / x-cron-secret also work)
```

The check lives in `lib/cron-auth.ts`.

## Jobs

| Job | Endpoint | Schedule | Purpose |
|---|---|---|---|
| `syncInbox` / `sync-inbox` | `POST /api/email/sync-inbox` | every 5 minutes | Read new Gmail messages → create tickets / add replies |
| `recurringTickets` / `recurring-tickets` | `POST /api/cron/process-recurring-tickets` | every 5 minutes | Create tickets from recurring rules that are due |
| `inboxReminders` / `inbox-reminders` | `POST /api/cron/inbox-reminders` | every hour | Remind the team once about tickets still unassigned after the reminder time (Settings → Scheduled jobs); also billing reminders (invoices past their due date, deposits that no longer cover what a client owes) |
| `timeTrigger` / `time-trigger` | `POST /api/automation/time-trigger` | daily 06:00 (Asia/Jakarta) | Run "Time Trigger" automation rules |

Time Trigger rules: each rule fires **once per idle period** of a ticket. After it fires it is skipped for
that ticket until the ticket is updated again (`tickets.timeTriggerFired`), so a rule such as "no update for
3 days → add note" adds one note, not one per run. Only open support tickets idle for at least a day are
checked. Daily is enough because the conditions are in days; a more frequent schedule only makes rules fire
sooner, it never repeats them.

Pick **one** scheduler below. Both are free at this volume.

## Option A — Google Apps Script (free)

Time-driven triggers in a Google Apps Script project call the endpoints with `UrlFetchApp`.

1. Open https://script.google.com → *New project*. Name it e.g. "Helpdesk scheduler".
2. Replace `Code.gs` with the script from **Settings → Scheduled jobs → Copy script** in the app
   (source: `lib/scheduler-apps-script.ts`).
3. Project Settings (gear) → *Script Properties* → add:
   - `APP_URL` = the app URL, no trailing slash (e.g. `https://helpdesk.example.com`)
   - `CRON_SECRET` = the value of `SYNC_INBOX_CRON_SECRET` on the server
4. In the editor, select the function `installTriggers` → *Run*. Approve the permission prompt
   (external requests + triggers). This creates the triggers; run it again after changing the schedule.
5. Select `syncInbox` → *Run* once to test. The log shows the HTTP status and the response.

Check runs in *Executions* (left sidebar), or in the app: **Settings → Scheduled jobs** shows the last run
of each job (time, OK / failed / late, counts) and has a *Run now* button. A failing run (401 / 5xx) is marked failed and Google emails
the script owner a daily failure summary.

Limits to keep in mind (free Gmail account; Google Workspace accounts have higher limits):
- Triggers can run at most every minute; the schedules above use 5 minutes.
- Total trigger run time: 90 minutes per day. Each run waits for the endpoint, so ~290 sync runs a day
  must average under ~15 seconds each (they normally take a few seconds). If executions start failing with a
  quota error, change `everyMinutes(5)` to `everyMinutes(10)` and run `installTriggers` again.
- The triggers run as the Google account that owns the script. Use a shared/team account so they do
  not stop when a person leaves.

## Option B — Google Cloud Scheduler

Managed scheduler in the same Google Cloud project. 3 jobs per billing account are free, then $0.10 per job
per month. Requires billing (already needed for App Hosting).

Replace `PROJECT_ID`, `APP_URL` (no trailing slash) and `SECRET`.

```bash
gcloud services enable cloudscheduler.googleapis.com --project PROJECT_ID
```

```bash
gcloud scheduler jobs create http sync-inbox --project PROJECT_ID --location asia-southeast1 --schedule "*/5 * * * *" --time-zone "Asia/Jakarta" --http-method POST --uri "APP_URL/api/email/sync-inbox" --headers "Authorization=Bearer SECRET" --attempt-deadline 300s
```

```bash
gcloud scheduler jobs create http recurring-tickets --project PROJECT_ID --location asia-southeast1 --schedule "*/5 * * * *" --time-zone "Asia/Jakarta" --http-method POST --uri "APP_URL/api/cron/process-recurring-tickets" --headers "Authorization=Bearer SECRET" --attempt-deadline 120s
```

```bash
gcloud scheduler jobs create http time-trigger --project PROJECT_ID --location asia-southeast1 --schedule "0 6 * * *" --time-zone "Asia/Jakarta" --http-method POST --uri "APP_URL/api/automation/time-trigger" --headers "Authorization=Bearer SECRET" --attempt-deadline 300s
```

Run a job now:

```bash
gcloud scheduler jobs run sync-inbox --project PROJECT_ID --location asia-southeast1
```

Change the secret on a job:

```bash
gcloud scheduler jobs update http sync-inbox --project PROJECT_ID --location asia-southeast1 --update-headers "Authorization=Bearer NEW_SECRET"
```

Job runs and HTTP status: Cloud Console → Cloud Scheduler → job → *View logs*.

## The secret on the server

App Hosting reads it from Secret Manager (see `apphosting.yaml`):

```bash
firebase apphosting:secrets:set SYNC_INBOX_CRON_SECRET
```

A good value: `openssl rand -hex 32`. After changing it, roll out the backend and update the scheduler
(Script Property `CRON_SECRET`, or the Cloud Scheduler job headers).

## Troubleshooting

- What the endpoint did (tickets created, errors): Firebase console → App Hosting → backend → *Logs*.
- `401`: the scheduler secret does not match `SYNC_INBOX_CRON_SECRET`.
- `503` from `sync-inbox`: Gmail is not connected yet (Settings → Email Integration) or
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` is missing.

## Local development

No scheduler runs locally. Trigger a job by hand:

```bash
curl -X POST http://localhost:3000/api/email/sync-inbox -H "Authorization: Bearer $SYNC_INBOX_CRON_SECRET"
```

Or use the **Sync inbox** button in Settings → Email Integration.

## Adding a job

1. Create the endpoint at `app/api/cron/<name>/route.ts` and start it with `if (!isCronRequest(req)) return 401`.
2. Add it to `lib/scheduled-jobs.ts`, wrap the handler with `withJobRun` (`lib/job-runs.ts`), add a function +
   trigger in `lib/scheduler-apps-script.ts` (or a Cloud Scheduler job).
3. Add it to the table in this document.
