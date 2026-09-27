/**
 * Role-based access control helpers.
 * - Admin: full access
 * - Manager: tickets + dashboard, ticket attributes
 * - Staff: dashboard (no companies, teams, email, knowledge-base, tickets, ticket attributes)
 * - Customer: limited (handled separately in sidebar)
 */

export function everyOneCanAccess(role: string | undefined): boolean {
  return true
}

export function isAdmin(role: string | undefined): boolean {
  return (role ?? '').toLowerCase() === 'admin'
}

export function isManager(role: string | undefined): boolean {
  return (role ?? '').toLowerCase() === 'manager'
}

export function isAdminOrManager(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase()
  return r === 'admin' || r === 'manager'
}

/** Move ticket to trash (DELETE or `ticket_type: trash`): Admin & Manager only */
export function canDeleteTickets(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Companies view + resync: Admin, Manager, Staff (and Customer for own company) */
export function canAccessCompanies(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase()
  return r === 'admin' || r === 'manager' || r === 'staff' || r === 'customer'
}

/** Companies edit (create/update/delete): Admin & Manager only */
export function canEditCompanies(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Tickets: Admin & Manager */
export function canAccessTickets(role: string | undefined): boolean {
  return everyOneCanAccess(role)
}

/** Ticket Attributes menu (statuses, types, priorities, tags): Admin & Manager */
export function canAccessTicketAttributes(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Automation rules UI & API: Admin & Manager */
export function canAccessAutomationRules(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Checklist templates (create/edit/delete): Admin & Manager */
export function canAccessChecklistTemplates(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Teams settings: Admin & Manager (view list/detail & reports; Manager cannot create teams) */
export function canAccessTeams(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Create/delete team, transfer creator, edit team name/type (API + UI) */
export function canAdminTeams(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Email Integration: Admin only */
export function canAccessEmailIntegration(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Slack ticket notifications (Incoming Webhooks): Admin only */
export function canAccessSlackNotifications(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Knowledge Base: Admin only */
export function canAccessKnowledgeBase(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Company Log (`company_daily_active_assignments`) in Settings → General: Admin & Manager */
export function canAccessCompanyLog(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Global running-text announcement (Settings): Admin only */
export function canManageGlobalAnnouncement(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Dashboard announcements (role-targeted, Settings): Admin only */
export function canManageDashboardAnnouncements(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Customer (company) time & ticket summary report: Admin & Manager */
export function canAccessCustomerTimeReport(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Projects (checklist / activities): internal users only */
export function canAccessProjects(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase()
  if (!role) return false
  return r !== 'customer'
}

/** Users: Admin only */
export function canAccessUsers(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Message / email templates (auto-response & notifications): Admin only */
export function canAccessMessageTemplates(role: string | undefined): boolean {
  return isAdmin(role)
}

/** AI provider settings (read-only env info): Admin only */
export function canAccessAiSettings(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Recurring tickets (auto-create on schedule): Admin & Manager */
export function canAccessRecurringTickets(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Ticket / recurring visibility audience rules: Admin & Manager */
export function canAccessTicketVisibilitySettings(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Settings hub (/settings): any configured admin area the role can open */
export function canAccessSettingsHub(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase()
  if (r === 'customer' || !role) return false
  return (
    canAccessTicketAttributes(role) ||
    canAccessEmailIntegration(role) ||
    canAccessSlackNotifications(role) ||
    canAccessMessageTemplates(role) ||
    canAccessKnowledgeBase(role) ||
    canManageGlobalAnnouncement(role) ||
    canManageDashboardAnnouncements(role) ||
    canAccessAutomationRules(role) ||
    canAccessUsers(role) ||
    canAccessCompanies(role) ||
    canAccessTeams(role) ||
    canAccessCompanyLog(role) ||
    canAccessAiSettings(role) ||
    canAccessRecurringTickets(role) ||
    canAccessTicketVisibilitySettings(role) ||
    canAccessChecklistTemplates(role)
  )
}

/** Settings hub and sub-pages live under `/settings/*` (sidebar highlights Settings). */
export function isSettingsHrefPathname(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === '/settings' || pathname.startsWith('/settings/')
}
