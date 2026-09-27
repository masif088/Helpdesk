/**
 * Firestore has no foreign keys. These helpers reproduce the old Postgres ON DELETE rules
 * (CASCADE / SET NULL / RESTRICT) so deleting a parent leaves no dangling children.
 */
import { count, findBy, remove, removeByKey, removeWhere, updateWhere } from './ops'
import * as S from './schema'

export class ForeignKeyRestrictError extends Error {
  /** Mirrors Postgres foreign_key_violation so existing handlers keep working. */
  readonly code = '23503'
  constructor(message: string) {
    super(message)
    this.name = 'ForeignKeyRestrictError'
  }
}

/** Delete one comment and what hangs off it. */
export async function deleteCommentCascade(commentId: string): Promise<S.TicketCommentsRow | null> {
  await Promise.all([
    removeWhere(S.commentAttachments, [['commentId', '==', commentId]]),
    removeWhere(S.ticketAiSummaries, [['focalCommentId', '==', commentId]]),
    updateWhere(S.ticketActivityLog, [['relatedCommentId', '==', commentId]], { relatedCommentId: null }),
  ])
  return remove(S.ticketComments, commentId)
}

/** Delete a ticket with all child rows (assignees, comments, checklist, time, tags, …). */
export async function deleteTicketCascade(ticketId: number): Promise<S.TicketsRow | null> {
  const comments = await findBy(S.ticketComments, { ticketId })
  for (const c of comments) await deleteCommentCascade(c.id)
  await Promise.all([
    removeWhere(S.ticketAssignees, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketChecklist, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketAttributs, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketTimeTracker, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketTags, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketAiSummaries, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketAttachments, [['ticketId', '==', ticketId]]),
    removeWhere(S.ticketCcRecipients, [['ticketId', '==', ticketId]]),
    updateWhere(S.screenshots, [['ticketId', '==', ticketId]], { ticketId: null }),
    updateWhere(S.ticketActivityLog, [['ticketId', '==', ticketId]], { ticketId: null }),
  ])
  return remove(S.tickets, ticketId)
}

export async function deleteCompanyCascade(companyId: string): Promise<S.CompaniesRow | null> {
  await Promise.all([
    removeWhere(S.companyUsers, [['companyId', '==', companyId]]),
    removeWhere(S.companyPayments, [['companyId', '==', companyId]]),
  ])
  return remove(S.companies, companyId)
}

/** Hard-delete a user row: memberships cascade, authored references become null. */
export async function deleteUserCascade(userId: string): Promise<S.UsersRow | null> {
  await Promise.all([
    removeWhere(S.companyUsers, [['userId', '==', userId]]),
    updateWhere(S.ticketChecklist, [['completedByUserId', '==', userId]], { completedByUserId: null }),
    updateWhere(S.checklistTemplates, [['createdByUserId', '==', userId]], { createdByUserId: null }),
    updateWhere(S.ticketComments, [['editedByUserId', '==', userId]], { editedByUserId: null }),
    updateWhere(S.ticketAiSummaries, [['createdByUserId', '==', userId]], { createdByUserId: null }),
    updateWhere(S.ticketActivityLog, [['actorUserId', '==', userId]], { actorUserId: null }),
    updateWhere(S.systemActivityLog, [['actorUserId', '==', userId]], { actorUserId: null }),
  ])
  return remove(S.users, userId)
}

export async function deleteTeamCascade(teamId: string): Promise<S.TeamsRow | null> {
  await Promise.all([
    removeWhere(S.teamMembers, [['teamId', '==', teamId]]),
    updateWhere(S.companies, [['activeTeamId', '==', teamId]], { activeTeamId: null }),
  ])
  return remove(S.teams, teamId)
}

export async function deleteProjectStatusCascade(statusId: number): Promise<S.ProjectStatusesRow | null> {
  await updateWhere(S.tickets, [['projectStatusId', '==', statusId]], { projectStatusId: null })
  return remove(S.projectStatuses, statusId)
}

export async function deleteProjectCascade(projectId: string): Promise<S.ProjectsRow | null> {
  const statuses = await findBy(S.projectStatuses, { projectId })
  for (const s of statuses) await deleteProjectStatusCascade(s.id)
  await Promise.all([
    updateWhere(S.tickets, [['projectId', '==', projectId]], { projectId: null }),
    updateWhere(S.screenshots, [['projectId', '==', projectId]], { projectId: null }),
  ])
  return remove(S.projects, projectId)
}

export async function deleteChecklistTemplateGroupCascade(groupId: string): Promise<S.ChecklistTemplateGroupsRow | null> {
  await updateWhere(S.checklistTemplateItems, [['groupId', '==', groupId]], { groupId: null })
  return remove(S.checklistTemplateGroups, groupId)
}

export async function deleteChecklistTemplateCascade(templateId: string): Promise<S.ChecklistTemplatesRow | null> {
  await Promise.all([
    removeWhere(S.checklistTemplateItems, [['templateId', '==', templateId]]),
    removeWhere(S.checklistTemplateGroups, [['templateId', '==', templateId]]),
  ])
  return remove(S.checklistTemplates, templateId)
}

export async function deleteRecurringTicketCascade(id: string): Promise<S.RecurringTicketsRow | null> {
  await removeWhere(S.recurringTicketRuns, [['recurringTicketId', '==', id]])
  return remove(S.recurringTickets, id)
}

export async function deleteJobTypeCascade(slug: string): Promise<S.JobTypesRow | null> {
  await updateWhere(S.ticketTimeTracker, [['jobType', '==', slug]], { jobType: null })
  return remove(S.jobTypes, slug)
}

/** tickets.type_id is ON DELETE RESTRICT. */
export async function deleteTicketTypeRestrict(typeId: number): Promise<S.TicketTypesRow | null> {
  if ((await count(S.tickets, [['typeId', '==', typeId]])) > 0) {
    throw new ForeignKeyRestrictError('delete violates foreign key constraint: ticket type is still used by tickets')
  }
  return remove(S.ticketTypes, typeId)
}

/** ticket_tags.tag_id is ON DELETE RESTRICT. */
export async function deleteTagRestrict(tagId: string): Promise<S.TagsRow | null> {
  if ((await count(S.ticketTags, [['tagId', '==', tagId]])) > 0) {
    throw new ForeignKeyRestrictError('delete violates foreign key constraint: tag is still used by tickets')
  }
  return remove(S.tags, tagId)
}

/** Remove one team membership by its doc key. */
export async function removeTeamMember(teamId: string, userId: string) {
  return removeByKey(S.teamMembers, { teamId, userId })
}

/** True when `err` is a foreign-key restriction (Postgres 23503 or ours). */
export function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23503'
}

