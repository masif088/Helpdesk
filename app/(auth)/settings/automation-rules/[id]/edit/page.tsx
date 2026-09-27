import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import AutomationRuleFormPage from '@/components/content/settings/AutomationRuleFormPage'
import { canAccessAutomationRules } from '@/lib/auth-utils'

export const metadata = { title: 'Edit automation rule' }

export default async function EditAutomationRulePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessAutomationRules((session.user as { role?: string }).role)) redirect('/dashboard')

  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()

  return (
    <AutomationRuleFormPage
      ruleId={id}
      user={{ id: session.user.id!, email: session.user.email ?? null, user_metadata: { full_name: session.user.name } }}
    />
  )
}
