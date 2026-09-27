/**
 * Google Apps Script that calls the scheduled jobs (free scheduler). Shown ready to copy in
 * Settings → Scheduled jobs; setup steps in docs/cron-jobs.md.
 * The secret is not in the script: it is read from the Script Property CRON_SECRET.
 */
export function schedulerAppsScript(appUrl: string): string {
  return `/**
 * Helpdesk scheduler: Google Apps Script time-driven triggers.
 * Script Properties (Project Settings → Script Properties):
 *   APP_URL      ${appUrl}
 *   CRON_SECRET  same value as SYNC_INBOX_CRON_SECRET on the server
 * Then run installTriggers once.
 */

function call_(path) {
  const props = PropertiesService.getScriptProperties()
  const res = UrlFetchApp.fetch(props.getProperty('APP_URL') + path, {
    method: 'post',
    payload: '',
    headers: { Authorization: 'Bearer ' + props.getProperty('CRON_SECRET') },
    muteHttpExceptions: true,
  })
  const code = res.getResponseCode()
  const body = res.getContentText().slice(0, 300)
  console.log(path + ' → ' + code + ' ' + body)
  if (code >= 500 || code === 401) throw new Error(path + ' failed: ' + code + ' ' + body)
}

function syncInbox() { call_('/api/email/sync-inbox') }
function recurringTickets() { call_('/api/cron/process-recurring-tickets') }
function timeTrigger() { call_('/api/automation/time-trigger') }

/** Run once: (re)creates all triggers. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t) })
  ScriptApp.newTrigger('syncInbox').timeBased().everyMinutes(5).create()
  ScriptApp.newTrigger('recurringTickets').timeBased().everyMinutes(5).create()
  ScriptApp.newTrigger('timeTrigger').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Jakarta').create()
}
`
}
