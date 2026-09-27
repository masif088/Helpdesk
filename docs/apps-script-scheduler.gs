/**
 * Free scheduler for the helpdesk jobs, using Google Apps Script time-driven triggers.
 * Setup: see docs/cron-jobs.md → "Option A — Google Apps Script".
 *
 * Script Properties (Project Settings → Script Properties):
 *   APP_URL      e.g. https://helpdesk.example.com   (no trailing slash)
 *   CRON_SECRET  same value as SYNC_INBOX_CRON_SECRET on the server
 */

function call_(path) {
  const props = PropertiesService.getScriptProperties()
  const url = props.getProperty('APP_URL') + path
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + props.getProperty('CRON_SECRET') },
    muteHttpExceptions: true,
  })
  const code = res.getResponseCode()
  const body = res.getContentText().slice(0, 300)
  console.log(path + ' → ' + code + ' ' + body)
  if (code >= 500 || code === 401) throw new Error(path + ' failed: ' + code + ' ' + body) // shows up in Executions + failure email
}

/** Gmail → tickets */
function syncInbox() {
  call_('/api/email/sync-inbox')
}

/** Recurring ticket rules that are due */
function recurringTickets() {
  call_('/api/cron/process-recurring-tickets')
}

/** "Time Trigger" automation rules (each rule fires once per idle period, so daily is enough) */
function timeTrigger() {
  call_('/api/automation/time-trigger')
}

/** Run once by hand: (re)creates all triggers. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('syncInbox').timeBased().everyMinutes(5).create()
  ScriptApp.newTrigger('recurringTickets').timeBased().everyMinutes(5).create()
  ScriptApp.newTrigger('timeTrigger').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Jakarta').create()
}
