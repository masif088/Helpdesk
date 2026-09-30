import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import KnowledgeBaseContent from '@/components/content/knowledge-base/KnowledgeBaseContent'
import { canAccessKnowledgeBase } from '@/lib/auth-utils'

export default async function KnowledgeBasePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canAccessKnowledgeBase((session.user as { role?: string }).role)) redirect('/dashboard')

  return <KnowledgeBaseContent user={session.user} />
}
