import { find, get, jobTypes } from '@/lib/fsdb'

export async function loadActiveJobTypeTitleMap(): Promise<Map<string, string>> {
  const rows = await find(jobTypes, {
    where: [['isActive', '==', true]],
    orderBy: [['sortOrder', 'asc'], ['slug', 'asc']],
  })
  return new Map(rows.map((r) => [r.slug, r.title]))
}

/** Empty or null slug = clear category. Otherwise slug must exist and be active. */
export async function assertValidJobTypeSlugOrNull(slug: string | null | undefined): Promise<void> {
  if (slug == null || slug === '') return
  const row = await get(jobTypes, slug)
  if (!row || !row.isActive) {
    throw new Error('Invalid or inactive job_type')
  }
}
