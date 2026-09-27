import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import AutomationRuleFormPage from '@/components/content/settings/AutomationRuleFormPage'
import { canAccessAutomationRules } from '@/lib/auth-utils'

export const metadata = { title: 'New automation rule' }

export default async function NewAutomationRulePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessAutomationRules((session.user as { role?: string }).role)) redirect('/dashboard')

  return (
    <AutomationRuleFormPage
      user={{ id: session.user.id!, email: session.user.email ?? null, user_metadata: { full_name: session.user.name } }}
    />
  )
}
