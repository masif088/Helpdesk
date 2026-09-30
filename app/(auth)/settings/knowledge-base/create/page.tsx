import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import KnowledgeBaseArticleForm from '@/components/knowledge-base/KnowledgeBaseArticleForm'
import { canAccessKnowledgeBase } from '@/lib/auth-utils'

export default async function KnowledgeBaseCreatePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessKnowledgeBase((session.user as { role?: string }).role)) redirect('/dashboard')
  return <KnowledgeBaseArticleForm user={session.user} />
}
