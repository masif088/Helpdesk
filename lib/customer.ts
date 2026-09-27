import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { companies, companyDatas, companyDataTemplates, companyWebsites, findBy, get, getManyMap, users } from '@/lib/fsdb'

export async function getCustomerCompanyData() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const userRow = await get(users, session.user.id)

  const companyId = userRow?.companyId
  if (!companyId) {
    redirect('/dashboard')
  }

  const companyRow = await get(companies, companyId)
  if (!companyRow) {
    redirect('/dashboard')
  }

  const [dataRows, companyWebsitesRows] = await Promise.all([
    findBy(companyDatas, { companyId }),
    findBy(companyWebsites, { companyId }),
  ])
  const templateMap = await getManyMap(companyDataTemplates, dataRows.map((d) => d.dataTemplateId))
  const companyDatasRows = dataRows.map((data) => ({ data, template: templateMap.get(data.dataTemplateId) ?? null }))

  const companyData = {
    id: companyRow.id,
    name: companyRow.name,
    email: companyRow.email,
    color: companyRow.color,
    is_active: companyRow.isActive ?? true,
    created_at: companyRow.createdAt ? new Date(companyRow.createdAt).toISOString() : '',
    updated_at: companyRow.updatedAt ? new Date(companyRow.updatedAt).toISOString() : '',
    company_datas: companyDatasRows.map((r) => ({
      id: r.data.id,
      company_id: r.data.companyId,
      data_template_id: r.data.dataTemplateId,
      value: r.data.value,
      created_at: r.data.createdAt ? new Date(r.data.createdAt).toISOString() : '',
      updated_at: r.data.updatedAt ? new Date(r.data.updatedAt).toISOString() : '',
      company_data_templates: r.template
        ? { id: r.template.id, title: r.template.title, group: r.template.group }
        : null,
    })),
    company_users: [],
    company_websites: companyWebsitesRows.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      description: r.description,
      is_primary: r.isPrimary ?? false,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    })),
  }

  return { user: session.user, companyData }
}
