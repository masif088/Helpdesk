/**
 * Firestore collections (one per former Postgres table). Generated from the old Drizzle schema —
 * field names stay camelCase exactly as before so row shapes did not change.
 * Doc keys use the table's natural unique key where one existed (e.g. email_messages → gmail_message_id),
 * so duplicate inserts fail like the old UNIQUE constraints did.
 */
import { defineTable } from './table'

export type AiSettingsRow = {
  id: string
  name: string
  isActive: boolean
  provider: string
  openaiApiKey: string | null
  openaiBaseUrl: string | null
  openaiModel: string | null
  codexApiKey: string | null
  codexBaseUrl: string | null
  codexModel: string | null
  createdAt: Date
  updatedAt: Date
  updatedBy: string | null
}

export type NewAiSettingsRow = {
  id?: string
  name?: string
  isActive?: boolean
  provider?: string
  openaiApiKey?: string | null
  openaiBaseUrl?: string | null
  openaiModel?: string | null
  codexApiKey?: string | null
  codexBaseUrl?: string | null
  codexModel?: string | null
  createdAt?: Date
  updatedAt?: Date
  updatedBy?: string | null
}

export const aiSettings = defineTable<AiSettingsRow, NewAiSettingsRow>({
  name: 'ai_settings',
  columns: ['id', 'name', 'isActive', 'provider', 'openaiApiKey', 'openaiBaseUrl', 'openaiModel', 'codexApiKey', 'codexBaseUrl', 'codexModel', 'createdAt', 'updatedAt', 'updatedBy'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'name': 'Default', 'isActive': false, 'provider': 'openai'},
  nowFields: ['createdAt', 'updatedAt'],
})

export type AiTokenUsageRow = {
  id: string
  userId: string | null
  usedFor: string
  aiModel: string
  aiVersion: string | null
  generatedDate: Date
  contentText: string | null
  promptId: string | null
  vectorReferenceId: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  companyId: string | null
  createdAt: Date
}

export type NewAiTokenUsageRow = {
  id?: string
  userId?: string | null
  usedFor: string
  aiModel: string
  aiVersion?: string | null
  generatedDate?: Date
  contentText?: string | null
  promptId?: string | null
  vectorReferenceId?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  companyId?: string | null
  createdAt?: Date
}

export const aiTokenUsage = defineTable<AiTokenUsageRow, NewAiTokenUsageRow>({
  name: 'ai_token_usage',
  columns: ['id', 'userId', 'usedFor', 'aiModel', 'aiVersion', 'generatedDate', 'contentText', 'promptId', 'vectorReferenceId', 'promptTokens', 'completionTokens', 'totalTokens', 'companyId', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'promptTokens': 0, 'completionTokens': 0, 'totalTokens': 0},
  nowFields: ['generatedDate', 'createdAt'],
})

export type ApiTokensRow = {
  id: string
  userId: string
  token: string
  name: string | null
  lastUsedAt: Date | null
  expiresAt: Date | null
  isActive: boolean | null
  createdAt: Date
  updatedAt: Date
}

export type NewApiTokensRow = {
  id?: string
  userId: string
  token: string
  name?: string | null
  lastUsedAt?: Date | null
  expiresAt?: Date | null
  isActive?: boolean | null
  createdAt?: Date
  updatedAt?: Date
}

export const apiTokens = defineTable<ApiTokensRow, NewApiTokensRow>({
  name: 'api_tokens',
  columns: ['id', 'userId', 'token', 'name', 'lastUsedAt', 'expiresAt', 'isActive', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'name': 'Chrome Extension', 'isActive': true},
  nowFields: ['createdAt', 'updatedAt'],
})

export type AppSettingsRow = {
  key: string
  value: string | null
  updatedAt: Date
}

export type NewAppSettingsRow = {
  key: string
  value?: string | null
  updatedAt?: Date
}

export const appSettings = defineTable<AppSettingsRow, NewAppSettingsRow>({
  name: 'app_settings',
  columns: ['key', 'value', 'updatedAt'],
  docKey: ['key'],
  idField: 'key',
  nowFields: ['updatedAt'],
})

export type AutomationRulesRow = {
  id: number
  name: string | null
  eventType: string
  conditions: unknown
  actions: unknown
  priority: number
  companyId: string | null
  status: boolean
  createdAt: Date
  updatedAt: Date
}

export type NewAutomationRulesRow = {
  id?: number
  name?: string | null
  eventType?: string
  conditions?: unknown
  actions?: unknown
  priority?: number
  companyId?: string | null
  status?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export const automationRules = defineTable<AutomationRulesRow, NewAutomationRulesRow>({
  name: 'automation_rules',
  columns: ['id', 'name', 'eventType', 'conditions', 'actions', 'priority', 'companyId', 'status', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'seq',
  defaults: {'eventType': 'ticket_created', 'conditions': {}, 'actions': {}, 'priority': 0, 'status': true},
  nowFields: ['createdAt', 'updatedAt'],
})

export type ChecklistTemplateGroupsRow = {
  id: string
  templateId: string
  title: string
  orderIndex: number | null
}

export type NewChecklistTemplateGroupsRow = {
  id?: string
  templateId: string
  title: string
  orderIndex?: number | null
}

export const checklistTemplateGroups = defineTable<ChecklistTemplateGroupsRow, NewChecklistTemplateGroupsRow>({
  name: 'checklist_template_groups',
  columns: ['id', 'templateId', 'title', 'orderIndex'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'orderIndex': 0},
})

export type ChecklistTemplateItemsRow = {
  id: string
  templateId: string
  groupId: string | null
  title: string
  note: string | null
  orderIndex: number | null
}

export type NewChecklistTemplateItemsRow = {
  id?: string
  templateId: string
  groupId?: string | null
  title: string
  note?: string | null
  orderIndex?: number | null
}

export const checklistTemplateItems = defineTable<ChecklistTemplateItemsRow, NewChecklistTemplateItemsRow>({
  name: 'checklist_template_items',
  columns: ['id', 'templateId', 'groupId', 'title', 'note', 'orderIndex'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'orderIndex': 0},
})

export type ChecklistTemplatesRow = {
  id: string
  title: string
  description: string | null
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewChecklistTemplatesRow = {
  id?: string
  title: string
  description?: string | null
  createdByUserId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const checklistTemplates = defineTable<ChecklistTemplatesRow, NewChecklistTemplatesRow>({
  name: 'checklist_templates',
  columns: ['id', 'title', 'description', 'createdByUserId', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type CommentAttachmentsRow = {
  id: string
  commentId: string
  fileUrl: string
  fileName: string
  filePath: string
  uploadedBy: string | null
  createdAt: Date
}

export type NewCommentAttachmentsRow = {
  id?: string
  commentId: string
  fileUrl: string
  fileName: string
  filePath: string
  uploadedBy?: string | null
  createdAt?: Date
}

export const commentAttachments = defineTable<CommentAttachmentsRow, NewCommentAttachmentsRow>({
  name: 'comment_attachments',
  columns: ['id', 'commentId', 'fileUrl', 'fileName', 'filePath', 'uploadedBy', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt'],
})

export type CompaniesRow = {
  id: string
  name: string
  isActive: boolean | null
  email: string | null
  domainList: string[] | null
  color: string | null
  activeTeamId: string | null
  activeManagerId: string | null
  isCustomer: boolean
  freshdeskId: number | null
  /** Default hourly rate copied to new tickets of this company (admin/manager only). */
  defaultHourlyRate: number | null
  /** IDR | USD */
  defaultRateCurrency: string | null
  /** Staff were told the deposit no longer covers what is owed (cleared once it does again) */
  lowDepositNotifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewCompaniesRow = {
  id?: string
  name: string
  isActive?: boolean | null
  email?: string | null
  domainList?: string[] | null
  color?: string | null
  activeTeamId?: string | null
  activeManagerId?: string | null
  isCustomer?: boolean
  freshdeskId?: number | null
  defaultHourlyRate?: number | null
  defaultRateCurrency?: string | null
  lowDepositNotifiedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export const companies = defineTable<CompaniesRow, NewCompaniesRow>({
  name: 'companies',
  columns: ['id', 'name', 'isActive', 'email', 'domainList', 'color', 'activeTeamId', 'activeManagerId', 'isCustomer', 'freshdeskId', 'defaultHourlyRate', 'defaultRateCurrency', 'lowDepositNotifiedAt', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'isActive': true, 'domainList': [], 'color': '#000000', 'isCustomer': false},
  nowFields: ['createdAt', 'updatedAt'],
})

/** Payments received from a company (billing: billed − paid = outstanding). */
export type CompanyPaymentsRow = {
  id: string
  companyId: string
  amount: number
  /** IDR | USD */
  currency: string
  paidAt: Date
  reference: string | null
  note: string | null
  createdBy: string | null
  createdAt: Date
}

export type NewCompanyPaymentsRow = {
  id?: string
  companyId: string
  amount: number
  currency: string
  paidAt: Date
  reference?: string | null
  note?: string | null
  createdBy?: string | null
  createdAt?: Date
}

export const companyPayments = defineTable<CompanyPaymentsRow, NewCompanyPaymentsRow>({
  name: 'company_payments',
  columns: ['id', 'companyId', 'amount', 'currency', 'paidAt', 'reference', 'note', 'createdBy', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {},
  nowFields: ['createdAt'],
})

export type InvoiceLine = {
  ticketId: number
  title: string
  /** Billable seconds in the period */
  seconds: number
  rate: number
  amount: number
  /** Time-tracker sessions billed on this line (never billed again unless the invoice is voided) */
  sessionIds?: string[]
  /** Fixed-price ticket: amount is the ticket's price, not hours × rate (billed once) */
  fixed?: boolean
  /** Fixed-price ticket whose price changed after it was invoiced: amount is the difference (may be negative) */
  adjustment?: boolean
}

export type InvoicesRow = {
  id: string
  /** e.g. INV-2026-0007 */
  number: string
  companyId: string
  currency: string
  periodFrom: string
  periodTo: string
  issueDate: string
  dueDate: string | null
  lines: InvoiceLine[]
  total: number
  /** issued | paid | void */
  status: string
  notes: string | null
  /** Payment recorded when the invoice was paid with new money */
  paymentId: string | null
  /** balance = settled from the client's deposit; payment = paid with a new payment */
  paidVia: string | null
  paidAt: string | null
  /** Deposit balance right after this invoice was settled (for the receipt) */
  balanceAfter: number | null
  /** Last time it was emailed to the client, and to whom */
  sentAt: Date | null
  sentTo: string | null
  /** Staff were notified that it is past its due date (once per invoice) */
  overdueNotifiedAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewInvoicesRow = {
  id?: string
  number: string
  companyId: string
  currency: string
  periodFrom: string
  periodTo: string
  issueDate: string
  dueDate?: string | null
  lines: InvoiceLine[]
  total: number
  status?: string
  notes?: string | null
  paymentId?: string | null
  paidVia?: string | null
  paidAt?: string | null
  balanceAfter?: number | null
  sentAt?: Date | null
  sentTo?: string | null
  overdueNotifiedAt?: Date | null
  createdBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const invoices = defineTable<InvoicesRow, NewInvoicesRow>({
  name: 'invoices',
  columns: ['id', 'number', 'companyId', 'currency', 'periodFrom', 'periodTo', 'issueDate', 'dueDate', 'lines', 'total', 'status', 'notes', 'paymentId', 'paidVia', 'paidAt', 'balanceAfter', 'sentAt', 'sentTo', 'overdueNotifiedAt', 'createdBy', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: { status: 'issued' },
  nowFields: ['createdAt', 'updatedAt'],
})

export type CompanyAttributesRow = {
  id: string
  companyId: string
  metaKey: string
  metaValue: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewCompanyAttributesRow = {
  id?: string
  companyId: string
  metaKey: string
  metaValue?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const companyAttributes = defineTable<CompanyAttributesRow, NewCompanyAttributesRow>({
  name: 'company_attributes',
  columns: ['id', 'companyId', 'metaKey', 'metaValue', 'createdAt', 'updatedAt'],
  docKey: ['companyId', 'metaKey'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type CompanyDataTemplatesRow = {
  id: string
  title: string
  group: string | null
  isActive: boolean | null
  createdAt: Date
  updatedAt: Date
}

export type NewCompanyDataTemplatesRow = {
  id: string
  title: string
  group?: string | null
  isActive?: boolean | null
  createdAt?: Date
  updatedAt?: Date
}

export const companyDataTemplates = defineTable<CompanyDataTemplatesRow, NewCompanyDataTemplatesRow>({
  name: 'company_data_templates',
  columns: ['id', 'title', 'group', 'isActive', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  defaults: {'isActive': true},
  nowFields: ['createdAt', 'updatedAt'],
})

export type CompanyDatasRow = {
  id: string
  companyId: string
  dataTemplateId: string
  value: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewCompanyDatasRow = {
  id?: string
  companyId: string
  dataTemplateId: string
  value?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const companyDatas = defineTable<CompanyDatasRow, NewCompanyDatasRow>({
  name: 'company_datas',
  columns: ['id', 'companyId', 'dataTemplateId', 'value', 'createdAt', 'updatedAt'],
  docKey: ['companyId', 'dataTemplateId'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type CompanyKnowledgeBasesRow = {
  id: string
  companyId: string | null
  type: string | null
  content: string | null
  sourceIds: string[] | null
  contentTemplateId: string | null
  usedFields: string[] | null
  embedding: unknown | null
  createdAt: Date
  updatedAt: Date
}

export type NewCompanyKnowledgeBasesRow = {
  id?: string
  companyId?: string | null
  type?: string | null
  content?: string | null
  sourceIds?: string[] | null
  contentTemplateId?: string | null
  usedFields?: string[] | null
  embedding?: unknown | null
  createdAt?: Date
  updatedAt?: Date
}

export const companyKnowledgeBases = defineTable<CompanyKnowledgeBasesRow, NewCompanyKnowledgeBasesRow>({
  name: 'company_knowledge_bases',
  columns: ['id', 'companyId', 'type', 'content', 'sourceIds', 'contentTemplateId', 'usedFields', 'embedding', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type CompanyUsersRow = {
  companyId: string
  userId: string
  companyRole: string
  createdAt: Date
  updatedAt: Date
}

export type NewCompanyUsersRow = {
  companyId: string
  userId: string
  companyRole?: string
  createdAt?: Date
  updatedAt?: Date
}

export const companyUsers = defineTable<CompanyUsersRow, NewCompanyUsersRow>({
  name: 'company_users',
  columns: ['companyId', 'userId', 'companyRole', 'createdAt', 'updatedAt'],
  docKey: ['companyId', 'userId'],
  defaults: {'companyRole': 'member'},
  nowFields: ['createdAt', 'updatedAt'],
})

export type CompanyWebsitesRow = {
  id: string
  companyId: string
  url: string
  title: string | null
  description: string | null
  isPrimary: boolean | null
  createdAt: Date
  updatedAt: Date
}

export type NewCompanyWebsitesRow = {
  id?: string
  companyId: string
  url: string
  title?: string | null
  description?: string | null
  isPrimary?: boolean | null
  createdAt?: Date
  updatedAt?: Date
}

export const companyWebsites = defineTable<CompanyWebsitesRow, NewCompanyWebsitesRow>({
  name: 'company_websites',
  columns: ['id', 'companyId', 'url', 'title', 'description', 'isPrimary', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'isPrimary': false},
  nowFields: ['createdAt', 'updatedAt'],
})

export type CrawlPagesRow = {
  id: string
  crawlSessionId: string
  url: string
  title: string | null
  description: string | null
  depth: number | null
  status: string | null
  httpStatusCode: number | null
  errorMessage: string | null
  contentType: string | null
  headingHierarchy: unknown | null
  metaTags: unknown | null
  links: unknown | null
  crawledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewCrawlPagesRow = {
  id?: string
  crawlSessionId: string
  url: string
  title?: string | null
  description?: string | null
  depth?: number | null
  status?: string | null
  httpStatusCode?: number | null
  errorMessage?: string | null
  contentType?: string | null
  headingHierarchy?: unknown | null
  metaTags?: unknown | null
  links?: unknown | null
  crawledAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export const crawlPages = defineTable<CrawlPagesRow, NewCrawlPagesRow>({
  name: 'crawl_pages',
  columns: ['id', 'crawlSessionId', 'url', 'title', 'description', 'depth', 'status', 'httpStatusCode', 'errorMessage', 'contentType', 'headingHierarchy', 'metaTags', 'links', 'crawledAt', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'depth': 0, 'status': 'pending'},
  nowFields: ['createdAt', 'updatedAt'],
})

export type CrawlSessionsRow = {
  id: string
  companyWebsiteId: string
  status: string | null
  totalPages: number | null
  crawledPages: number | null
  failedPages: number | null
  uncrawledPages: number | null
  brokenPages: number | null
  errorMessage: string | null
  maxDepth: number | null
  maxPages: number | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewCrawlSessionsRow = {
  id?: string
  companyWebsiteId: string
  status?: string | null
  totalPages?: number | null
  crawledPages?: number | null
  failedPages?: number | null
  uncrawledPages?: number | null
  brokenPages?: number | null
  errorMessage?: string | null
  maxDepth?: number | null
  maxPages?: number | null
  startedAt?: Date | null
  completedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export const crawlSessions = defineTable<CrawlSessionsRow, NewCrawlSessionsRow>({
  name: 'crawl_sessions',
  columns: ['id', 'companyWebsiteId', 'status', 'totalPages', 'crawledPages', 'failedPages', 'uncrawledPages', 'brokenPages', 'errorMessage', 'maxDepth', 'maxPages', 'startedAt', 'completedAt', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'status': 'pending', 'totalPages': 0, 'crawledPages': 0, 'failedPages': 0, 'uncrawledPages': 0, 'brokenPages': 0, 'maxDepth': 3, 'maxPages': 100},
  nowFields: ['createdAt', 'updatedAt'],
})

export type DashboardAnnouncementsRow = {
  id: string
  title: string
  body: string
  targetRoles: string[] | null
  isPublished: boolean
  startsAt: Date | null
  endsAt: Date | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
}

export type NewDashboardAnnouncementsRow = {
  id?: string
  title: string
  body?: string
  targetRoles?: string[] | null
  isPublished?: boolean
  startsAt?: Date | null
  endsAt?: Date | null
  sortOrder?: number
  createdAt?: Date
  updatedAt?: Date
  createdBy?: string | null
}

export const dashboardAnnouncements = defineTable<DashboardAnnouncementsRow, NewDashboardAnnouncementsRow>({
  name: 'dashboard_announcements',
  columns: ['id', 'title', 'body', 'targetRoles', 'isPublished', 'startsAt', 'endsAt', 'sortOrder', 'createdAt', 'updatedAt', 'createdBy'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'body': '', 'isPublished': false, 'sortOrder': 0},
  nowFields: ['createdAt', 'updatedAt'],
})

export type EmailIntegrationsRow = {
  id: string
  provider: string
  emailAddress: string | null
  accessToken: string | null
  refreshToken: string | null
  expiresAt: Date | null
  isActive: boolean | null
  lastSyncAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewEmailIntegrationsRow = {
  id?: string
  provider?: string
  emailAddress?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  expiresAt?: Date | null
  isActive?: boolean | null
  lastSyncAt?: Date | null
  createdBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const emailIntegrations = defineTable<EmailIntegrationsRow, NewEmailIntegrationsRow>({
  name: 'email_integrations',
  columns: ['id', 'provider', 'emailAddress', 'accessToken', 'refreshToken', 'expiresAt', 'isActive', 'lastSyncAt', 'createdBy', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'provider': 'google', 'isActive': true},
  nowFields: ['createdAt', 'updatedAt'],
})

export type EmailMessagesRow = {
  id: string
  gmailMessageId: string
  threadId: string | null
  fromEmail: string | null
  toEmail: string | null
  subject: string | null
  snippet: string | null
  ticketId: number | null
  direction: string
  rfcMessageId: string | null
  syncedAt: Date
  createdAt: Date
}

export type NewEmailMessagesRow = {
  id?: string
  gmailMessageId: string
  threadId?: string | null
  fromEmail?: string | null
  toEmail?: string | null
  subject?: string | null
  snippet?: string | null
  ticketId?: number | null
  direction: string
  rfcMessageId?: string | null
  syncedAt?: Date
  createdAt?: Date
}

export const emailMessages = defineTable<EmailMessagesRow, NewEmailMessagesRow>({
  name: 'email_messages',
  columns: ['id', 'gmailMessageId', 'threadId', 'fromEmail', 'toEmail', 'subject', 'snippet', 'ticketId', 'direction', 'rfcMessageId', 'syncedAt', 'createdAt'],
  docKey: ['gmailMessageId'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['syncedAt', 'createdAt'],
})

export type EmailSkipListRow = {
  id: string
  email: string
  reason: string | null
  createdAt: Date
}

export type NewEmailSkipListRow = {
  id?: string
  email: string
  reason?: string | null
  createdAt?: Date
}

export const emailSkipList = defineTable<EmailSkipListRow, NewEmailSkipListRow>({
  name: 'email_skip_list',
  columns: ['id', 'email', 'reason', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt'],
})

export type GlobalAnnouncementRow = {
  id: string
  message: string
  isEnabled: boolean
  startsAt: Date | null
  endsAt: Date | null
  updatedAt: Date
  updatedBy: string | null
}

export type NewGlobalAnnouncementRow = {
  id: string
  message?: string
  isEnabled?: boolean
  startsAt?: Date | null
  endsAt?: Date | null
  updatedAt?: Date
  updatedBy?: string | null
}

export const globalAnnouncement = defineTable<GlobalAnnouncementRow, NewGlobalAnnouncementRow>({
  name: 'global_announcement',
  columns: ['id', 'message', 'isEnabled', 'startsAt', 'endsAt', 'updatedAt', 'updatedBy'],
  docKey: ['id'],
  idField: 'id',
  defaults: {'message': '', 'isEnabled': false},
  nowFields: ['updatedAt'],
})

export type JobTypesRow = {
  slug: string
  title: string
  sortOrder: number
  isActive: boolean
  /** Time with this job type is billed to the client. */
  billable: boolean
  createdAt: Date
}

export type NewJobTypesRow = {
  slug: string
  title: string
  sortOrder?: number
  isActive?: boolean
  billable?: boolean
  createdAt?: Date
}

export const jobTypes = defineTable<JobTypesRow, NewJobTypesRow>({
  name: 'job_types',
  columns: ['slug', 'title', 'sortOrder', 'isActive', 'billable', 'createdAt'],
  docKey: ['slug'],
  idField: 'slug',
  defaults: {'sortOrder': 0, 'isActive': true, 'billable': true},
  nowFields: ['createdAt'],
})

export type KnowledgeBaseArticlesRow = {
  id: string
  title: string
  status: string
  description: string | null
  category: string | null
  sortOrder: number | null
  targetRoles: string[] | null
  createdAt: Date
  updatedAt: Date
}

export type NewKnowledgeBaseArticlesRow = {
  id?: string
  title: string
  status?: string
  description?: string | null
  category?: string | null
  sortOrder?: number | null
  targetRoles?: string[] | null
  createdAt?: Date
  updatedAt?: Date
}

export const knowledgeBaseArticles = defineTable<KnowledgeBaseArticlesRow, NewKnowledgeBaseArticlesRow>({
  name: 'knowledge_base_articles',
  columns: ['id', 'title', 'status', 'description', 'category', 'sortOrder', 'targetRoles', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'status': 'draft', 'category': 'general', 'sortOrder': 0},
  nowFields: ['createdAt', 'updatedAt'],
})

export type MessageTemplatesRow = {
  id: string
  type: string
  templateGroup: string
  title: string
  key: string
  status: string
  emailSubject: string | null
  content: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewMessageTemplatesRow = {
  id?: string
  type: string
  templateGroup: string
  title: string
  key: string
  status?: string
  emailSubject?: string | null
  content?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const messageTemplates = defineTable<MessageTemplatesRow, NewMessageTemplatesRow>({
  name: 'message_templates',
  columns: ['id', 'type', 'templateGroup', 'title', 'key', 'status', 'emailSubject', 'content', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'status': 'active'},
  nowFields: ['createdAt', 'updatedAt'],
})

export type ProjectStatusesRow = {
  id: number
  projectId: string
  title: string
  slug: string
  color: string
  sortOrder: number
  createdAt: Date
}

export type NewProjectStatusesRow = {
  id?: number
  projectId: string
  title: string
  slug: string
  color?: string
  sortOrder?: number
  createdAt?: Date
}

export const projectStatuses = defineTable<ProjectStatusesRow, NewProjectStatusesRow>({
  name: 'project_statuses',
  columns: ['id', 'projectId', 'title', 'slug', 'color', 'sortOrder', 'createdAt'],
  docKey: ['projectId', 'slug'],
  idField: 'id',
  idGen: 'seq',
  defaults: {'color': '#d9d9d9', 'sortOrder': 0},
  nowFields: ['createdAt'],
})

export type ProjectsRow = {
  id: string
  title: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewProjectsRow = {
  id?: string
  title: string
  description?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const projects = defineTable<ProjectsRow, NewProjectsRow>({
  name: 'projects',
  columns: ['id', 'title', 'description', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type RecurringTicketRunsRow = {
  id: string
  recurringTicketId: string
  ticketId: number | null
  ranAt: Date
  status: string
  error: string | null
}

export type NewRecurringTicketRunsRow = {
  id?: string
  recurringTicketId: string
  ticketId?: number | null
  ranAt?: Date
  status?: string
  error?: string | null
}

export const recurringTicketRuns = defineTable<RecurringTicketRunsRow, NewRecurringTicketRunsRow>({
  name: 'recurring_ticket_runs',
  columns: ['id', 'recurringTicketId', 'ticketId', 'ranAt', 'status', 'error'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'status': 'success'},
  nowFields: ['ranAt'],
})

export type RecurringTicketsRow = {
  id: string
  title: string
  description: string | null
  frequency: string
  specificDays: number[] | null
  specificDate: number[] | null
  intervalDays: number | null
  timeOfDay: string
  timezone: string
  startDate: string
  endDate: string | null
  isActive: boolean
  lastRunAt: Date | null
  nextRunAt: Date | null
  ticketStatus: string | null
  ticketPriority: number | null
  teamId: string | null
  companyId: string | null
  assigneeIds: string[] | null
  ticketTypeId: number | null
  contactUserId: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewRecurringTicketsRow = {
  id?: string
  title: string
  description?: string | null
  frequency?: string
  specificDays?: number[] | null
  specificDate?: number[] | null
  intervalDays?: number | null
  timeOfDay?: string
  timezone?: string
  startDate: string
  endDate?: string | null
  isActive?: boolean
  lastRunAt?: Date | null
  nextRunAt?: Date | null
  ticketStatus?: string | null
  ticketPriority?: number | null
  teamId?: string | null
  companyId?: string | null
  assigneeIds?: string[] | null
  ticketTypeId?: number | null
  contactUserId?: string | null
  createdBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const recurringTickets = defineTable<RecurringTicketsRow, NewRecurringTicketsRow>({
  name: 'recurring_tickets',
  columns: ['id', 'title', 'description', 'frequency', 'specificDays', 'specificDate', 'intervalDays', 'timeOfDay', 'timezone', 'startDate', 'endDate', 'isActive', 'lastRunAt', 'nextRunAt', 'ticketStatus', 'ticketPriority', 'teamId', 'companyId', 'assigneeIds', 'ticketTypeId', 'contactUserId', 'createdBy', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'frequency': 'daily', 'timeOfDay': '08:00', 'timezone': 'UTC', 'isActive': true, 'ticketPriority': 0, 'assigneeIds': []},
  nowFields: ['createdAt', 'updatedAt'],
})

export type ScreenshotsRow = {
  id: string
  userId: string
  fileName: string
  filePath: string
  fileUrl: string
  fileSize: number | null
  mimeType: string | null
  ticketId: number | null
  projectId: string | null
  title: string | null
  description: string | null
  tags: string[] | null
  createdAt: Date
  updatedAt: Date
}

export type NewScreenshotsRow = {
  id?: string
  userId: string
  fileName: string
  filePath: string
  fileUrl: string
  fileSize?: number | null
  mimeType?: string | null
  ticketId?: number | null
  projectId?: string | null
  title?: string | null
  description?: string | null
  tags?: string[] | null
  createdAt?: Date
  updatedAt?: Date
}

export const screenshots = defineTable<ScreenshotsRow, NewScreenshotsRow>({
  name: 'screenshots',
  columns: ['id', 'userId', 'fileName', 'filePath', 'fileUrl', 'fileSize', 'mimeType', 'ticketId', 'projectId', 'title', 'description', 'tags', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type SlackTicketNotificationRulesRow = {
  id: string
  name: string | null
  webhookUrl: string
  isEnabled: boolean
  filter: unknown
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export type NewSlackTicketNotificationRulesRow = {
  id?: string
  name?: string | null
  webhookUrl: string
  isEnabled?: boolean
  filter?: unknown
  sortOrder?: number
  createdAt?: Date
  updatedAt?: Date
}

export const slackTicketNotificationRules = defineTable<SlackTicketNotificationRulesRow, NewSlackTicketNotificationRulesRow>({
  name: 'slack_ticket_notification_rules',
  columns: ['id', 'name', 'webhookUrl', 'isEnabled', 'filter', 'sortOrder', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'isEnabled': true, 'filter': {}, 'sortOrder': 0},
  nowFields: ['createdAt', 'updatedAt'],
})

export type SystemActivityLogRow = {
  id: string
  actorUserId: string | null
  actorRole: string
  category: string
  action: string
  entityType: string | null
  entityId: string | null
  metadata: unknown | null
  createdAt: Date
}

export type NewSystemActivityLogRow = {
  id?: string
  actorUserId?: string | null
  actorRole?: string
  category: string
  action: string
  entityType?: string | null
  entityId?: string | null
  metadata?: unknown | null
  createdAt?: Date
}

export const systemActivityLog = defineTable<SystemActivityLogRow, NewSystemActivityLogRow>({
  name: 'system_activity_log',
  columns: ['id', 'actorUserId', 'actorRole', 'category', 'action', 'entityType', 'entityId', 'metadata', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'actorRole': 'agent'},
  nowFields: ['createdAt'],
})

export type TagsRow = {
  id: string
  name: string
  slug: string
  color: string | null
  /** Agent skills this needs (routing: who to suggest for the ticket) */
  requiredSkills: string[] | null
  companyId: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewTagsRow = {
  id?: string
  name: string
  slug: string
  color?: string | null
  requiredSkills?: string[] | null
  companyId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const tags = defineTable<TagsRow, NewTagsRow>({
  name: 'tags',
  columns: ['id', 'name', 'slug', 'color', 'requiredSkills', 'companyId', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'color': '#000000'},
  nowFields: ['createdAt', 'updatedAt'],
})

export type TeamMembersRow = {
  id: string
  teamId: string
  userId: string
  role: string | null
  joinedAt: Date
}

export type NewTeamMembersRow = {
  id?: string
  teamId: string
  userId: string
  role?: string | null
  joinedAt?: Date
}

export const teamMembers = defineTable<TeamMembersRow, NewTeamMembersRow>({
  name: 'team_members',
  columns: ['id', 'teamId', 'userId', 'role', 'joinedAt'],
  docKey: ['teamId', 'userId'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'role': 'member'},
  nowFields: ['joinedAt'],
})

export type TeamsRow = {
  id: string
  name: string
  type: string | null
  createdBy: string
  createdAt: Date
}

export type NewTeamsRow = {
  id?: string
  name: string
  type?: string | null
  createdBy: string
  createdAt?: Date
}

export const teams = defineTable<TeamsRow, NewTeamsRow>({
  name: 'teams',
  columns: ['id', 'name', 'type', 'createdBy', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt'],
})

export type TicketActivityLogRow = {
  id: string
  ticketId: number | null
  actorUserId: string | null
  actorRole: string
  action: string
  metadata: unknown | null
  relatedCommentId: string | null
  createdAt: Date
}

export type NewTicketActivityLogRow = {
  id?: string
  ticketId?: number | null
  actorUserId?: string | null
  actorRole?: string
  action: string
  metadata?: unknown | null
  relatedCommentId?: string | null
  createdAt?: Date
}

export const ticketActivityLog = defineTable<TicketActivityLogRow, NewTicketActivityLogRow>({
  name: 'ticket_activity_log',
  columns: ['id', 'ticketId', 'actorUserId', 'actorRole', 'action', 'metadata', 'relatedCommentId', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'actorRole': 'agent'},
  nowFields: ['createdAt'],
})

export type TicketAiSummariesRow = {
  id: string
  ticketId: number
  anchorType: string
  focalCommentId: string | null
  summary: unknown
  checklist: unknown
  createdByUserId: string | null
  createdAt: Date
  appliedToCommentAt: Date | null
  appliedToDescriptionAt: Date | null
  appliedToChecklistAt: Date | null
}

export type NewTicketAiSummariesRow = {
  id?: string
  ticketId: number
  anchorType: string
  focalCommentId?: string | null
  summary?: unknown
  checklist?: unknown
  createdByUserId?: string | null
  createdAt?: Date
  appliedToCommentAt?: Date | null
  appliedToDescriptionAt?: Date | null
  appliedToChecklistAt?: Date | null
}

export const ticketAiSummaries = defineTable<TicketAiSummariesRow, NewTicketAiSummariesRow>({
  name: 'ticket_ai_summaries',
  columns: ['id', 'ticketId', 'anchorType', 'focalCommentId', 'summary', 'checklist', 'createdByUserId', 'createdAt', 'appliedToCommentAt', 'appliedToDescriptionAt', 'appliedToChecklistAt'],
  docKey: ['ticketId', 'anchorType', 'focalCommentId'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'summary': [], 'checklist': []},
  nowFields: ['createdAt'],
})

export type TicketAssigneesRow = {
  id: string
  ticketId: number
  userId: string
  createdAt: Date | null
  updatedAt: Date | null
}

export type NewTicketAssigneesRow = {
  id?: string
  ticketId: number
  userId: string
  createdAt?: Date | null
  updatedAt?: Date | null
}

export const ticketAssignees = defineTable<TicketAssigneesRow, NewTicketAssigneesRow>({
  name: 'ticket_assignees',
  columns: ['id', 'ticketId', 'userId', 'createdAt', 'updatedAt'],
  docKey: ['ticketId', 'userId'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type TicketAttachmentsRow = {
  id: string
  ticketId: number
  fileUrl: string
  fileName: string
  filePath: string
  uploadedBy: string | null
  createdAt: Date
}

export type NewTicketAttachmentsRow = {
  id?: string
  ticketId: number
  fileUrl: string
  fileName: string
  filePath: string
  uploadedBy?: string | null
  createdAt?: Date
}

export const ticketAttachments = defineTable<TicketAttachmentsRow, NewTicketAttachmentsRow>({
  name: 'ticket_attachments',
  columns: ['id', 'ticketId', 'fileUrl', 'fileName', 'filePath', 'uploadedBy', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt'],
})

export type TicketAttributsRow = {
  id: string
  ticketId: number
  metaKey: string
  metaValue: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewTicketAttributsRow = {
  id?: string
  ticketId: number
  metaKey: string
  metaValue?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const ticketAttributs = defineTable<TicketAttributsRow, NewTicketAttributsRow>({
  name: 'ticket_attributs',
  columns: ['id', 'ticketId', 'metaKey', 'metaValue', 'createdAt', 'updatedAt'],
  docKey: ['ticketId', 'metaKey'],
  idField: 'id',
  idGen: 'uuid',
  nowFields: ['createdAt', 'updatedAt'],
})

export type TicketCcRecipientsRow = {
  ticketId: number
  email: string
  createdAt: Date
}

export type NewTicketCcRecipientsRow = {
  ticketId: number
  email: string
  createdAt?: Date
}

export const ticketCcRecipients = defineTable<TicketCcRecipientsRow, NewTicketCcRecipientsRow>({
  name: 'ticket_cc_recipients',
  columns: ['ticketId', 'email', 'createdAt'],
  docKey: ['ticketId', 'email'],
  nowFields: ['createdAt'],
})

export type TicketChecklistRow = {
  id: string
  ticketId: number
  title: string
  isCompleted: boolean | null
  orderIndex: number | null
  completedAt: Date | null
  completedByUserId: string | null
  completionNote: string | null
  groupName: string | null
  createdAt: Date
}

export type NewTicketChecklistRow = {
  id?: string
  ticketId: number
  title: string
  isCompleted?: boolean | null
  orderIndex?: number | null
  completedAt?: Date | null
  completedByUserId?: string | null
  completionNote?: string | null
  groupName?: string | null
  createdAt?: Date
}

export const ticketChecklist = defineTable<TicketChecklistRow, NewTicketChecklistRow>({
  name: 'ticket_checklist',
  columns: ['id', 'ticketId', 'title', 'isCompleted', 'orderIndex', 'completedAt', 'completedByUserId', 'completionNote', 'groupName', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'isCompleted': false, 'orderIndex': 0},
  nowFields: ['createdAt'],
})

export type TicketCommentsRow = {
  id: string
  ticketId: number
  userId: string
  comment: string
  visibility: string | null
  authorType: string | null
  taggedUserIds: string[] | null
  ccEmails: string[] | null
  bccEmails: string[] | null
  createdAt: Date
  receivedAt: Date
  fdConversationId: number | null
  editedByUserId: string | null
  editedAt: Date | null
}

export type NewTicketCommentsRow = {
  id?: string
  ticketId: number
  userId: string
  comment: string
  visibility?: string | null
  authorType?: string | null
  taggedUserIds?: string[] | null
  ccEmails?: string[] | null
  bccEmails?: string[] | null
  createdAt?: Date
  receivedAt?: Date
  fdConversationId?: number | null
  editedByUserId?: string | null
  editedAt?: Date | null
}

export const ticketComments = defineTable<TicketCommentsRow, NewTicketCommentsRow>({
  name: 'ticket_comments',
  columns: ['id', 'ticketId', 'userId', 'comment', 'visibility', 'authorType', 'taggedUserIds', 'ccEmails', 'bccEmails', 'createdAt', 'receivedAt', 'fdConversationId', 'editedByUserId', 'editedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'visibility': 'note', 'authorType': 'agent'},
  nowFields: ['createdAt', 'receivedAt'],
})

export type TicketStatusesRow = {
  id: number
  slug: string
  title: string
  description: string | null
  customerTitle: string | null
  color: string
  showInKanban: boolean | null
  isDeletable: boolean
  isActive: boolean
  sortOrder: number | null
  createdAt: Date
  updatedAt: Date
}

export type NewTicketStatusesRow = {
  id?: number
  slug: string
  title: string
  description?: string | null
  customerTitle?: string | null
  color: string
  showInKanban?: boolean | null
  isDeletable?: boolean
  isActive?: boolean
  sortOrder?: number | null
  createdAt?: Date
  updatedAt?: Date
}

export const ticketStatuses = defineTable<TicketStatusesRow, NewTicketStatusesRow>({
  name: 'ticket_statuses',
  columns: ['id', 'slug', 'title', 'description', 'customerTitle', 'color', 'showInKanban', 'isDeletable', 'isActive', 'sortOrder', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'seq',
  defaults: {'description': '', 'showInKanban': true, 'isDeletable': true, 'isActive': true, 'sortOrder': 0},
  nowFields: ['createdAt', 'updatedAt'],
})

export type TicketTagsRow = {
  ticketId: number
  tagId: string
  createdAt: Date
}

export type NewTicketTagsRow = {
  ticketId: number
  tagId: string
  createdAt?: Date
}

export const ticketTags = defineTable<TicketTagsRow, NewTicketTagsRow>({
  name: 'ticket_tags',
  columns: ['ticketId', 'tagId', 'createdAt'],
  docKey: ['ticketId', 'tagId'],
  nowFields: ['createdAt'],
})

export type TicketTimeTrackerRow = {
  id: string
  ticketId: number
  userId: string
  trackerType: string
  jobType: string | null
  startTime: Date
  stopTime: Date | null
  durationSeconds: number | null
  durationAdjustment: number | null
  note: string | null
  createdAt: Date
}

export type NewTicketTimeTrackerRow = {
  id?: string
  ticketId: number
  userId: string
  trackerType?: string
  jobType?: string | null
  startTime: Date
  stopTime?: Date | null
  durationSeconds?: number | null
  durationAdjustment?: number | null
  note?: string | null
  createdAt?: Date
}

export const ticketTimeTracker = defineTable<TicketTimeTrackerRow, NewTicketTimeTrackerRow>({
  name: 'ticket_time_tracker',
  columns: ['id', 'ticketId', 'userId', 'trackerType', 'jobType', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment', 'note', 'createdAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'trackerType': 'timer'},
  nowFields: ['createdAt'],
})

export type TicketTypesRow = {
  id: number
  slug: string
  title: string
  description: string | null
  color: string | null
  sortOrder: number | null
  isAgentOnly: boolean
  /** Agent skills this needs (routing: who to suggest for the ticket) */
  requiredSkills: string[] | null
  companyId: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewTicketTypesRow = {
  id?: number
  slug: string
  title: string
  description?: string | null
  color?: string | null
  sortOrder?: number | null
  isAgentOnly?: boolean
  requiredSkills?: string[] | null
  companyId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const ticketTypes = defineTable<TicketTypesRow, NewTicketTypesRow>({
  name: 'ticket_types',
  columns: ['id', 'slug', 'title', 'description', 'color', 'sortOrder', 'isAgentOnly', 'requiredSkills', 'companyId', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'seq',
  defaults: {'description': '', 'color': '#000000', 'sortOrder': 0, 'isAgentOnly': false},
  nowFields: ['createdAt', 'updatedAt'],
})

export type TicketsRow = {
  id: number
  title: string
  description: string | null
  originalDescription: string | null
  shortNote: string | null
  createdBy: string | null
  contactUserId: string | null
  dueDate: Date | null
  status: string
  teamId: string | null
  gmailThreadId: string | null
  priority: number | null
  createdVia: string | null
  lastReadAt: Date | null
  customerLastReadAt: Date | null
  staffLastReadAt: Date | null
  typeId: number | null
  ticketType: string
  companyId: string | null
  projectId: string | null
  projectStatusId: number | null
  /** Hourly billing rate for this ticket (admin/manager only). */
  hourlyRate: number | null
  /** IDR | USD */
  rateCurrency: string | null
  /** Fixed price for the whole ticket, whatever the hours (replaces the hourly rate when set; same currency) */
  fixedPrice: number | null
  /** Time-trigger automation: rule id → ISO time it last fired on this ticket (fires once per idle period) */
  timeTriggerFired: Record<string, string> | null
  /** Inbox reminder already sent for this ticket (cleared never: one reminder per ticket) */
  inboxReminderAt: Date | null
  source: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewTicketsRow = {
  id?: number
  title: string
  description?: string | null
  originalDescription?: string | null
  shortNote?: string | null
  createdBy?: string | null
  contactUserId?: string | null
  dueDate?: Date | null
  status?: string
  teamId?: string | null
  gmailThreadId?: string | null
  priority?: number | null
  createdVia?: string | null
  lastReadAt?: Date | null
  customerLastReadAt?: Date | null
  staffLastReadAt?: Date | null
  typeId?: number | null
  ticketType?: string
  companyId?: string | null
  projectId?: string | null
  projectStatusId?: number | null
  hourlyRate?: number | null
  rateCurrency?: string | null
  fixedPrice?: number | null
  timeTriggerFired?: Record<string, string> | null
  inboxReminderAt?: Date | null
  source?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const tickets = defineTable<TicketsRow, NewTicketsRow>({
  name: 'tickets',
  columns: ['id', 'title', 'description', 'originalDescription', 'shortNote', 'createdBy', 'contactUserId', 'dueDate', 'status', 'teamId', 'gmailThreadId', 'priority', 'createdVia', 'lastReadAt', 'customerLastReadAt', 'staffLastReadAt', 'typeId', 'ticketType', 'companyId', 'projectId', 'projectStatusId', 'hourlyRate', 'rateCurrency', 'fixedPrice', 'timeTriggerFired', 'inboxReminderAt', 'source', 'createdAt', 'updatedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'seq',
  defaults: {'status': 'open', 'priority': 0, 'ticketType': 'support'},
  nowFields: ['createdAt', 'updatedAt'],
})

export type UsersRow = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  avatarUrl: string | null
  role: string
  permissions: unknown | null
  status: string
  isEmailVerified: boolean | null
  lastLoginAt: Date | null
  lastActiveAt: Date | null
  phone: string | null
  department: string | null
  position: string | null
  bio: string | null
  /** Agent skills (free-form labels), used to group agents */
  skills: string[] | null
  timezone: string | null
  locale: string | null
  mustChangePassword: boolean | null
  metadata: unknown | null
  companyId: string | null
  /** Contacts only: 'person' | 'automated' (bot / no-reply → email tickets become notifications) */
  contactKind: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export type NewUsersRow = {
  id?: string
  email: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  avatarUrl?: string | null
  role?: string
  permissions?: unknown | null
  status?: string
  isEmailVerified?: boolean | null
  lastLoginAt?: Date | null
  lastActiveAt?: Date | null
  phone?: string | null
  department?: string | null
  position?: string | null
  bio?: string | null
  skills?: string[] | null
  timezone?: string | null
  locale?: string | null
  mustChangePassword?: boolean | null
  metadata?: unknown | null
  companyId?: string | null
  contactKind?: string | null
  createdAt?: Date
  updatedAt?: Date
  deletedAt?: Date | null
}

export const users = defineTable<UsersRow, NewUsersRow>({
  name: 'users',
  columns: ['id', 'email', 'firstName', 'lastName', 'fullName', 'avatarUrl', 'role', 'permissions', 'status', 'isEmailVerified', 'lastLoginAt', 'lastActiveAt', 'phone', 'department', 'position', 'bio', 'skills', 'timezone', 'locale', 'mustChangePassword', 'metadata', 'companyId', 'contactKind', 'createdAt', 'updatedAt', 'deletedAt'],
  docKey: ['id'],
  idField: 'id',
  idGen: 'uuid',
  defaults: {'role': 'user', 'status': 'active', 'isEmailVerified': false, 'timezone': 'UTC', 'locale': 'en', 'mustChangePassword': false},
  nowFields: ['createdAt', 'updatedAt'],
})

export const allTables = [invoices, aiSettings, aiTokenUsage, apiTokens, appSettings, automationRules, checklistTemplateGroups, checklistTemplateItems, checklistTemplates, commentAttachments, companies, companyAttributes, companyDataTemplates, companyPayments, companyDatas, companyKnowledgeBases, companyUsers, companyWebsites, crawlPages, crawlSessions, dashboardAnnouncements, emailIntegrations, emailMessages, emailSkipList, globalAnnouncement, jobTypes, knowledgeBaseArticles, messageTemplates, projectStatuses, projects, recurringTicketRuns, recurringTickets, screenshots, slackTicketNotificationRules, systemActivityLog, tags, teamMembers, teams, ticketActivityLog, ticketAiSummaries, ticketAssignees, ticketAttachments, ticketAttributs, ticketCcRecipients, ticketChecklist, ticketComments, ticketStatuses, ticketTags, ticketTimeTracker, ticketTypes, tickets, users] as const
