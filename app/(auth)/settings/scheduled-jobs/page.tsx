import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ScheduledJobsContent from '@/components/content/settings/ScheduledJobsContent'
import { isAdmin } from '@/lib/auth-utils'
import { BRANDING } from '@/lib/branding'
import { cronSecret } from '@/lib/cron-auth'
import { emailIntegrations, findOneBy } from '@/lib/fsdb'
import { getJobRuns } from '@/lib/job-runs'
import { schedulerAppsScript } from '@/lib/scheduler-apps-script'

export const metadata = { title: 'Scheduled jobs' }

export default async function ScheduledJobsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin((session.user as { role?: string }).role)) redirect('/settings')

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const appUrl = (BRANDING.siteUrl || (host ? `https://${host}` : '')).replace(/\/$/, '')

  const [runs, gmail] = await Promise.all([getJobRuns(), findOneBy(emailIntegrations, { provider: 'google' })])

  return (
    <ScheduledJobsContent
      user={session.user}
      runs={runs}
      appUrl={appUrl}
      secretConfigured={!!cronSecret()}
      gmail={
        gmail
          ? {
              email: gmail.emailAddress ?? null,
              active: gmail.isActive !== false,
              lastSyncAt: gmail.lastSyncAt ? new Date(gmail.lastSyncAt).toISOString() : null,
            }
          : null
      }
      script={schedulerAppsScript(appUrl || 'https://your-app-url')}
    />
  )
}
