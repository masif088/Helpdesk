import { insertMany, projectStatuses } from '@/lib/fsdb'

/** Default Kanban columns for a new (or migrated) project. */
export async function seedDefaultProjectStatuses(projectId: string) {
  await insertMany(projectStatuses, [
    { projectId, title: 'Backlog', slug: 'backlog', color: '#F1C232', sortOrder: 0 },
    { projectId, title: 'In progress', slug: 'in_progress', color: '#1890ff', sortOrder: 1 },
    { projectId, title: 'Done', slug: 'done', color: '#52c41a', sortOrder: 2 },
  ])
}
