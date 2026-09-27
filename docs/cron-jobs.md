# Cron Jobs — DeskTeam360

All cron jobs run on the Lightsail server (`ubuntu@3.23.67.169`) via `crontab`.
Auth uses `Authorization: Bearer <secret>` read from `.env`.

## Cron Job List

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/email/sync-inbox` | Every 2 minutes | Sync email inbox (Gmail/IMAP), create tickets from incoming mail |
| `POST /api/cron/process-recurring-tickets` | Every 1 minute | Create tickets automatically from recurring rules that are due |

## Secret / Auth

All cron endpoints use the same secret:

```
env var: SYNC_INBOX_CRON_SECRET
header:  Authorization: Bearer <value>
```

The secret is stored in `/var/www/dt-labs/.env` on the server.

## Crontab on Server

To view/edit active crons:

```bash
ssh -i "~/LightsailDefaultKey-us-east-2.pem" ubuntu@3.23.67.169
crontab -l        # list
crontab -e        # edit
```

Current crontab:

```cron
# Email inbox sync — every 2 minutes
*/2 * * * * curl -s -X POST https://ticket.deskteam360.com/api/email/sync-inbox \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-sync-inbox.log 2>&1

# Process recurring tickets — every minute
* * * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/process-recurring-tickets \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-recurring.log 2>&1

```

## Log Files

Each cron's output is stored on the server:

```
/var/log/dt-labs-sync-inbox.log       — latest email sync result
/var/log/dt-labs-recurring.log        — latest recurring ticket process result
```

Check the latest logs:

```bash
tail -f /var/log/dt-labs-recurring.log
tail -f /var/log/dt-labs-sync-inbox.log
```

## Adding a New Cron

1. Create an endpoint at `app/api/cron/<name>/route.ts`
2. Add an auth check using `SYNC_INBOX_CRON_SECRET` (or create a new secret in `.env`)
3. Install it on the server via `crontab -e`
4. Update the table in this document
