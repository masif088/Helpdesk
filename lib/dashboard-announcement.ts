import type { dashboardAnnouncements } from '@/lib/fsdb'
import { articleVisibleForRole } from '@/lib/knowledge-base-article-roles'

export type DashboardAnnouncementRow = typeof dashboardAnnouncements.$inferSelect

export function announcementVisibleForViewer(
  row: Pick<
    DashboardAnnouncementRow,
    'isPublished' | 'targetRoles' | 'startsAt' | 'endsAt'
  >,
  userRole: string | undefined,
  now = new Date()
): boolean {
  if (!row.isPublished) return false
  if (!articleVisibleForRole(row.targetRoles ?? undefined, userRole)) return false
  const t = now.getTime()
  if (row.startsAt && t < row.startsAt.getTime()) return false
  if (row.endsAt && t > row.endsAt.getTime()) return false
  return true
}
