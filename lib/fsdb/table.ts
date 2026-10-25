/**
 * A Firestore collection definition that mirrors one former Postgres table.
 *
 * - `docKey`: fields joined into the Firestore document id. Usually the primary key; for tables that had a
 *   natural unique constraint (e.g. team_members(team_id, user_id)) it is that constraint, so upserts are a
 *   plain `set` and duplicates are impossible.
 * - `idField`: the row's own id column (may differ from `docKey`, e.g. team_members keeps its uuid `id`).
 * - `idGen`: 'uuid' → random uuid, 'seq' → integer from `_counters/{name}` (tickets, statuses, …).
 */
export type TableOptions<Row> = {
  name: string
  columns: readonly (keyof Row & string)[]
  docKey: readonly (keyof Row & string)[]
  idField?: keyof Row & string
  idGen?: 'uuid' | 'seq'
  defaults?: Partial<Record<keyof Row & string, unknown>>
  nowFields?: readonly (keyof Row & string)[]
  /** Extra computed fields stored on the document (not part of the row type), e.g. `emailLower`. */
  derive?: (row: Row) => Record<string, unknown>
}

export type Table<Row, Insert> = TableOptions<Row> & {
  /** Type-only helpers kept for call sites that used Drizzle's `typeof table.$inferSelect`. */
  readonly $inferSelect: Row
  readonly $inferInsert: Insert
}

export function defineTable<Row, Insert>(opts: TableOptions<Row>): Table<Row, Insert> {
  return opts as Table<Row, Insert>
}

export type AnyTable = Table<any, any>  
export type RowOf<T> = T extends Table<infer R, unknown> ? R : never
export type InsertOf<T> = T extends Table<infer _R, infer I> ? I : never

const KEY_SEP = '__'

/** Firestore doc ids may not contain '/'; keep them readable otherwise. */
function keyPart(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  return String(v).replace(/\//g, '%2F')
}

export function docIdFor<Row>(table: TableOptions<Row>, row: Partial<Row>): string {
  return table.docKey.map((k) => keyPart((row as Record<string, unknown>)[k])).join(KEY_SEP)
}

/** True when a plain id lookup can read the document directly (doc id === id column). */
export function idIsDocKey<Row>(table: TableOptions<Row>): boolean {
  return table.docKey.length === 1 && table.idField === table.docKey[0]
}
