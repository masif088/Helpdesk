/** Default job types (time tracker categories): what the time was spent on, and whether it is billed to the client. */
export const DEFAULT_JOB_TYPES = [
  { slug: 'execution', title: 'Execution', sortOrder: 10, billable: true },
  { slug: 'revision', title: 'Revision', sortOrder: 20, billable: true },
  { slug: 'qa', title: 'QA / Testing', sortOrder: 30, billable: true },
  { slug: 'communication', title: 'Client communication', sortOrder: 40, billable: true },
  { slug: 'research', title: 'Research / Analysis', sortOrder: 50, billable: true },
  { slug: 'internal', title: 'Internal', sortOrder: 60, billable: false },
] as const
