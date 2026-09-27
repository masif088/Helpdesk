import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import KnowledgeBaseArticleForm from '@/components/knowledge-base/KnowledgeBaseArticleForm'
import { get, knowledgeBaseArticles } from '@/lib/fsdb'

export default async function KnowledgeBaseEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params

  const row = await get(knowledgeBaseArticles, id)

  if (!row) {
    redirect('/settings/knowledge-base')
  }

  const initialValues = {
    title: row.title,
    status: row.status,
    description: row.description ?? '',
    category: row.category ?? 'general',
    sort_order: row.sortOrder ?? 0,
    target_roles: row.targetRoles ?? null,
  }

  return (
    <KnowledgeBaseArticleForm
      user={session.user}
      articleId={id}
      initialValues={initialValues}
    />
  )
}
