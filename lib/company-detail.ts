/**
 * Server-side helper to fetch company with related data
 * Used by company detail page and API
 */
import {
  companies,
  companyDatas,
  companyDataTemplates,
  companyUsers,
  companyWebsites,
  findBy,
  get,
  getMany,
  getManyMap,
  teams,
  users,
} from '@/lib/fsdb'

/** `includeBilling`: add the default hourly rate (admin / manager views only). */
export async function getCompanyDetail(id: string, opts?: { includeBilling?: boolean }) {
  const companyRow = await get(companies, id)

  if (!companyRow) return null

  // Users: `users.company_id` plus `company_users` junction (e.g. email CC)
  const [usersByCompanyId, dataRows, companyWebsitesRows, cuRows] = await Promise.all([
    findBy(users, { companyId: id }),
    findBy(companyDatas, { companyId: id }),
    findBy(companyWebsites, { companyId: id }),
    findBy(companyUsers, { companyId: id }),
  ])
  const templateMap = await getManyMap(companyDataTemplates, dataRows.map((d) => d.dataTemplateId))
  const companyDatasRows = dataRows.map((data) => ({ data, template: templateMap.get(data.dataTemplateId) ?? null }))

  const byId = new Map(usersByCompanyId.map((u) => [u.id, u]))
  const cuOnlyIds = cuRows.map((r) => r.userId).filter((uid) => !byId.has(uid))
  const extraUsers = await getMany(users, cuOnlyIds)

  const cuMap = new Map(cuRows.map((r) => [r.userId, r]))
  const mergedUsers = [...usersByCompanyId, ...extraUsers]

  const company = companyRow
  const companyUsersList = mergedUsers.map((u) => {
    const cu = cuMap.get(u.id)
    return {
      user_id: u.id,
      created_at: cu?.createdAt
        ? new Date(cu.createdAt).toISOString()
        : u.createdAt
          ? new Date(u.createdAt).toISOString()
          : '',
      company_role: cu?.companyRole ?? 'member',
      users: { id: u.id, full_name: u.fullName, email: u.email, role: u.role },
    }
  })

  const companyDatasList = companyDatasRows.map((r) => ({
    id: r.data.id,
    company_id: r.data.companyId,
    data_template_id: r.data.dataTemplateId,
    value: r.data.value,
    created_at: r.data.createdAt ? new Date(r.data.createdAt).toISOString() : '',
    updated_at: r.data.updatedAt ? new Date(r.data.updatedAt).toISOString() : '',
    company_data_templates: r.template
      ? { id: r.template.id, title: r.template.title, group: r.template.group }
      : null,
  }))

  const companyWebsitesList = companyWebsitesRows.map((r) => ({
    id: r.id,
    company_id: r.companyId,
    url: r.url,
    title: r.title,
    description: r.description,
    is_primary: r.isPrimary ?? false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  let active_team_name: string | null = null
  let active_manager_display: string | null = null
  if (companyRow.activeTeamId) {
    const t = await get(teams, companyRow.activeTeamId)
    active_team_name = t?.name ?? null
  }
  if (companyRow.activeManagerId) {
    const m = await get(users, companyRow.activeManagerId)
    if (m?.email) {
      active_manager_display = `${m.fullName || m.email} (${m.email})`
    }
  }

  return {
    id: company.id,
    name: company.name,
    email: company.email,
    color: company.color,
    is_active: company.isActive ?? true,
    active_team_id: company.activeTeamId ?? null,
    active_team_name,
    active_manager_id: company.activeManagerId ?? null,
    active_manager_display,
    is_customer: company.isCustomer ?? false,
    freshdesk_id: company.freshdeskId ?? null,
    ...(opts?.includeBilling
      ? {
          default_hourly_rate: company.defaultHourlyRate ?? null,
          default_rate_currency: company.defaultRateCurrency ?? null,
        }
      : {}),
    created_at: company.createdAt ? new Date(company.createdAt).toISOString() : '',
    updated_at: company.updatedAt ? new Date(company.updatedAt).toISOString() : '',
    company_users: companyUsersList,
    company_datas: companyDatasList,
    company_websites: companyWebsitesList,
  }
}
