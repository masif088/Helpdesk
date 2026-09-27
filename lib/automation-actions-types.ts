/**
 * Actions schema for automation_rules.actions JSONB.
 * Engine will apply these when conditions match.
 */
export interface AutomationActions {
  /** Assign ticket to this team (uuid) */
  team_id?: string
  /** Integer ticket Priority value */
  priority?: number
  /** @deprecated UI removed; engine still applies legacy rules */
  type_slug?: string
  /** Row classification: support | spam | trash (column ticket_type, not type_id) */
  ticket_type?: string
  /** @deprecated UI removed; engine still applies legacy rules */
  status_slug?: string
  /** Add these tags (array of tag uuids) */
  tag_ids?: string[]
  /** Assign ticket to this company (uuid) */
  company_id?: string
  /** Assign these agents to the ticket (array of user uuids) */
  assignee_ids?: string[]
  /** Add an automatic note (comment) to the ticket — shown as "Automation", no user picker */
  add_note?: string
  /** @deprecated Optional: if set, the note is attributed to this user; engine default uses a placeholder */
  add_note_user_id?: string
  /** Add checklist items (array of titles) */
  add_checklist_items?: string[]
  /** Legacy: assign group name (maps to team by name if needed) */
  assign_group?: string
}
