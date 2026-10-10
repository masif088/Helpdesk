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
  /**
   * Assign the best-matching agent by skill. `min_match` = percent of the ticket's needed skills the agent must
   * have (100 = all). Skills are the ticket's own, else its type's / tags' defaults. Runs after the other actions.
   */
  auto_assign_by_skill?: AutoAssignBySkill
  /** Legacy: assign group name (maps to team by name if needed) */
  assign_group?: string
}

export interface AutoAssignBySkill {
  /** 1-100 */
  min_match: number
  /** Skip when someone is already assigned (default true) */
  only_if_unassigned?: boolean
  /** Only members of the ticket's team (ignored when the ticket has no team) */
  team_only?: boolean
}
