import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import EmailIntegrationContent from '@/components/content/settings/EmailIntegrationContent'
import { emailIntegrations, findOneBy } from '@/lib/fsdb'

export default async function EmailIntegrationPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const integrationRow = await findOneBy(emailIntegrations, { provider: 'google' })

  const integration = integrationRow
    ? {
        id: integrationRow.id,
        provider: integrationRow.provider,
        email_address: integrationRow.emailAddress,
        is_active: integrationRow.isActive ?? false,
        expires_at: integrationRow.expiresAt ? new Date(integrationRow.expiresAt).toISOString() : null,
        created_at: integrationRow.createdAt ? new Date(integrationRow.createdAt).toISOString() : '',
        last_sync_at: integrationRow.lastSyncAt ? new Date(integrationRow.lastSyncAt).toISOString() : null,
      }
    : null

  return (
    <EmailIntegrationContent
      user={session.user}
      integration={integration}
    />
  )
}
