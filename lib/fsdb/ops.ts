import { randomUUID } from 'node:crypto'

import {
  AggregateField,
  type DocumentData,
  type DocumentReference,
  FieldValue,
  type Query,
  type QueryDocumentSnapshot,
  type WhereFilterOp,
} from 'firebase-admin/firestore'

import { decodeValue, encodeValue, fdb } from './firestore'
import { type AnyTable, docIdFor, idIsDocKey, type InsertOf, type RowOf } from './table'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhereOp = Extract<
  WhereFilterOp,
  '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any'
>

/** Computed fields stored next to row columns (see `derive` in lib/fsdb/index.ts). */
export type DerivedField = 'emailLower' | 'searchKeywords' | 'kwTitle' | 'kwDescription' | 'kwComment'

/** `[field, op, value]`. Falsy entries are ignored so callers can write `cond && [...]`. */
export type Cond<R> = readonly [(keyof R & string) | DerivedField, WhereOp, unknown]
export type Conds<R> = readonly (Cond<R> | false | null | undefined | 0 | '')[]
export type Order<R> = readonly [keyof R & string, 'asc' | 'desc']

export type FindOptions<R> = {
  where?: Conds<R>
  orderBy?: readonly Order<R>[]
  limit?: number
  offset?: number
  /** Projection: only these fields are transferred (others come back as null). */
  select?: readonly (keyof R & string)[]
}

/** Increment marker for `update` patches (like `sql\`col + n\``). */
export type Increment = { readonly __increment: number }
export function inc(n: number): Increment {
  return { __increment: n }
}
function isIncrement(v: unknown): v is Increment {
  return typeof v === 'object' && v !== null && '__increment' in v
}

export type Patch<R> = { [K in keyof R]?: R[K] | Increment }

// ─── Internals ────────────────────────────────────────────────────────────────

const IN_LIMIT = 30
const BATCH_LIMIT = 450

function col(table: AnyTable) {
  return fdb().collection(table.name)
}

function cleanConds<R>(where?: Conds<R>): Cond<R>[] {
  return (where ?? []).filter(Boolean) as Cond<R>[]
}

function fromSnap<T extends AnyTable>(table: T, snap: { data(): DocumentData | undefined }): RowOf<T> {
  const raw = decodeValue(snap.data() ?? {}) as Record<string, unknown>
  const row: Record<string, unknown> = {}
  for (const c of table.columns) row[c] = raw[c] ?? null
  return row as RowOf<T>
}

function comparable(v: unknown): unknown {
  if (v instanceof Date) return v.getTime()
  return v
}

function cmp(a: unknown, b: unknown): number {
  const x = comparable(a)
  const y = comparable(b)
  if (x === y) return 0
  if (x === null || x === undefined) return -1
  if (y === null || y === undefined) return 1
  if (typeof x === 'number' && typeof y === 'number') return x - y
  if (typeof x === 'boolean' && typeof y === 'boolean') return Number(x) - Number(y)
  return String(x) < String(y) ? -1 : 1
}

function eqv(a: unknown, b: unknown): boolean {
  return cmp(a, b) === 0 && (a === null) === (b === null)
}

/** Evaluate one condition in memory — same semantics as Firestore (null never matches ranges / !=). */
export function matchCond(row: Record<string, unknown>, [field, op, value]: Cond<Record<string, unknown>>): boolean {
  const v = row[field] ?? null
  switch (op) {
    case '==':
      return eqv(v, value)
    case '!=':
      return v !== null && !eqv(v, value)
    case '<':
      return v !== null && cmp(v, value) < 0
    case '<=':
      return v !== null && cmp(v, value) <= 0
    case '>':
      return v !== null && cmp(v, value) > 0
    case '>=':
      return v !== null && cmp(v, value) >= 0
    case 'in':
      return (value as unknown[]).some((x) => eqv(v, x))
    case 'not-in':
      return v !== null && !(value as unknown[]).some((x) => eqv(v, x))
    case 'array-contains':
      return Array.isArray(v) && v.some((x) => eqv(x, value))
    case 'array-contains-any':
      return Array.isArray(v) && v.some((x) => (value as unknown[]).some((y) => eqv(x, y)))
  }
}

export function sortRows<R>(rows: R[], orderBy?: readonly Order<R>[]): R[] {
  if (!orderBy?.length) return rows
  return [...rows].sort((a, b) => {
    for (const [f, dir] of orderBy) {
      const c = cmp((a as Record<string, unknown>)[f], (b as Record<string, unknown>)[f])
      if (c !== 0) return dir === 'desc' ? -c : c
    }
    return 0
  })
}

function applyConds(q: Query, conds: Cond<unknown>[]): Query {
  for (const [f, op, v] of conds) q = q.where(f, op, encodeValue(v) as unknown)
  return q
}

function isMissingIndex(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 9 || /FAILED_PRECONDITION|requires an index/i.test(e?.message ?? '')
}

const warnedIndexes = new Set<string>()
function warnMissingIndex(table: AnyTable, err: unknown) {
  const msg = (err as Error).message ?? String(err)
  const key = `${table.name}:${msg.slice(0, 200)}`
  if (warnedIndexes.has(key)) return
  warnedIndexes.add(key)
  console.warn(`[fsdb] ${table.name}: missing composite index, falling back to in-memory filtering. ${msg}`)
}

/**
 * Run a query. Splits `in` lists above Firestore's limit, and — when a composite index is missing —
 * falls back to an equality-only query evaluated in memory (logged once with the index link).
 */
async function runQuery<T extends AnyTable>(table: T, opts: FindOptions<RowOf<T>>): Promise<RowOf<T>[]> {
  const conds = cleanConds(opts.where) as Cond<unknown>[]

  for (const [, op, v] of conds) {
    if ((op === 'in' || op === 'array-contains-any') && Array.isArray(v) && v.length === 0) return []
  }
  const effective = conds.filter(([, op, v]) => !(op === 'not-in' && Array.isArray(v) && v.length === 0))

  const bigIn = effective.findIndex(([, op, v]) => (op === 'in' || op === 'array-contains-any') && (v as unknown[]).length > IN_LIMIT)
  const tooManyNotIn = effective.some(([, op, v]) => op === 'not-in' && (v as unknown[]).length > 10)
  if (bigIn >= 0 || tooManyNotIn) {
    return runChunked(table, effective, bigIn, opts)
  }

  let q: Query = applyConds(col(table), effective)
  if (opts.select?.length) q = q.select(...opts.select)
  for (const [f, dir] of opts.orderBy ?? []) q = q.orderBy(f, dir)
  if (opts.offset) q = q.offset(opts.offset)
  if (opts.limit != null) q = q.limit(opts.limit)
  try {
    const snap = await q.get()
    return snap.docs.map((d) => fromSnap(table, d))
  } catch (err) {
    if (!isMissingIndex(err)) throw err
    warnMissingIndex(table, err)
    return inMemory(table, effective, opts)
  }
}

async function runChunked<T extends AnyTable>(
  table: T,
  conds: Cond<unknown>[],
  bigIn: number,
  opts: FindOptions<RowOf<T>>
): Promise<RowOf<T>[]> {
  if (bigIn < 0) return inMemory(table, conds, opts)
  const [field, op, values] = conds[bigIn]
  const rest = conds.filter((_, i) => i !== bigIn)
  const list = values as unknown[]
  const chunks: unknown[][] = []
  for (let i = 0; i < list.length; i += IN_LIMIT) chunks.push(list.slice(i, i + IN_LIMIT))
  const parts = await Promise.all(
    chunks.map((chunk) =>
      runQuery(table, { where: [...rest, [field, op, chunk]] as Conds<RowOf<T>>, select: opts.select })
    )
  )
  const seen = new Set<string>()
  const merged: RowOf<T>[] = []
  for (const r of parts.flat()) {
    const id = docIdFor(table, r)
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(r)
  }
  return paginate(sortRows(merged, opts.orderBy), opts)
}

function paginate<R>(rows: R[], opts: FindOptions<R>): R[] {
  const start = opts.offset ?? 0
  return opts.limit != null ? rows.slice(start, start + opts.limit) : rows.slice(start)
}

async function inMemory<T extends AnyTable>(
  table: T,
  conds: Cond<unknown>[],
  opts: FindOptions<RowOf<T>>
): Promise<RowOf<T>[]> {
  // Equality filters never need a composite index; everything else is evaluated here.
  const eqConds = conds.filter(([, op, v]) => op === '==' && v !== null)
  let q: Query = applyConds(col(table), eqConds)
  let docs: QueryDocumentSnapshot[]
  try {
    docs = (await q.get()).docs
  } catch (err) {
    if (!isMissingIndex(err)) throw err
    q = col(table)
    docs = (await q.get()).docs
  }
  const rows = docs
    .map((d) => ({ row: fromSnap(table, d), raw: decodeValue(d.data()) as Record<string, unknown> }))
    .filter(({ raw }) => conds.every((c) => matchCond(raw, c)))
    .map(({ row }) => row)
  return paginate(sortRows(rows, opts.orderBy), opts)
}

function refById(table: AnyTable, id: string | number): DocumentReference {
  return col(table).doc(String(id))
}

async function refForId(table: AnyTable, id: string | number): Promise<DocumentReference | null> {
  if (idIsDocKey(table)) return refById(table, id)
  if (!table.idField) return refById(table, id)
  const snap = await col(table).where(table.idField, '==', id).limit(1).get()
  return snap.empty ? null : snap.docs[0].ref
}

// ─── Sequences ────────────────────────────────────────────────────────────────

/** Reserve `n` consecutive integer ids for a table (`_counters/{table}`); returns the first one. */
export async function nextSeq(name: string, n = 1): Promise<number> {
  const ref = fdb().collection('_counters').doc(name)
  return fdb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = Number(snap.data()?.value ?? 0)
    tx.set(ref, { value: current + n }, { merge: true })
    return current + 1
  })
}

/** Raise a counter so it is at least `min` (used by the Postgres import). */
export async function ensureSeqAtLeast(name: string, min: number): Promise<void> {
  const ref = fdb().collection('_counters').doc(name)
  await fdb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = Number(snap.data()?.value ?? 0)
    if (current < min) tx.set(ref, { value: min }, { merge: true })
  })
}

// ─── Row building ─────────────────────────────────────────────────────────────

function buildRow<T extends AnyTable>(table: T, data: InsertOf<T>, now: Date, seqId?: number): RowOf<T> {
  const src = data as Record<string, unknown>
  const row: Record<string, unknown> = {}
  for (const c of table.columns) {
    let v = src[c]
    if (v === undefined) {
      if (table.idField === c && table.idGen === 'uuid') v = randomUUID()
      else if (table.idField === c && table.idGen === 'seq') v = seqId
      else if (table.nowFields?.includes(c)) v = now
      else if (table.defaults && c in table.defaults) v = structuredClone((table.defaults as Record<string, unknown>)[c])
      else v = null
    }
    row[c] = v
  }
  return row as RowOf<T>
}

function toDoc<T extends AnyTable>(table: T, row: RowOf<T>): Record<string, unknown> {
  const extra = table.derive ? table.derive(row) : {}
  return encodeValue({ ...(row as Record<string, unknown>), ...extra }) as Record<string, unknown>
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 6 || /ALREADY_EXISTS/i.test(e?.message ?? '')
}

export class UniqueViolationError extends Error {
  constructor(table: string, id: string) {
    super(`Duplicate key in ${table}: ${id}`)
    this.name = 'UniqueViolationError'
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function find<T extends AnyTable>(table: T, opts: FindOptions<RowOf<T>> = {}): Promise<RowOf<T>[]> {
  return runQuery(table, opts)
}

export async function findOne<T extends AnyTable>(
  table: T,
  opts: FindOptions<RowOf<T>> = {}
): Promise<RowOf<T> | null> {
  const rows = await runQuery(table, { ...opts, limit: 1 })
  return rows[0] ?? null
}

/** Shorthand: rows where every `field == value` in `match`. */
export async function findBy<T extends AnyTable>(
  table: T,
  match: Partial<RowOf<T>>,
  opts: Omit<FindOptions<RowOf<T>>, 'where'> & { where?: Conds<RowOf<T>> } = {}
): Promise<RowOf<T>[]> {
  const eq = Object.entries(match).map(([k, v]) => [k, '==', v] as const) as unknown as Cond<RowOf<T>>[]
  return runQuery(table, { ...opts, where: [...eq, ...(opts.where ?? [])] })
}

export async function findOneBy<T extends AnyTable>(table: T, match: Partial<RowOf<T>>): Promise<RowOf<T> | null> {
  const rows = await findBy(table, match, { limit: 1 })
  return rows[0] ?? null
}

/**
 * Stream rows page by page with a query cursor (for scans that filter in memory, e.g. activity feeds).
 * Falls back to one in-memory sorted read when the composite index is missing.
 */
export async function* scan<T extends AnyTable>(
  table: T,
  opts: { where?: Conds<RowOf<T>>; orderBy?: readonly Order<RowOf<T>>[] },
  pageSize = 500
): AsyncGenerator<RowOf<T>[]> {
  const conds = cleanConds(opts.where) as Cond<unknown>[]
  let base: Query = applyConds(col(table), conds)
  for (const [f, dir] of opts.orderBy ?? []) base = base.orderBy(f, dir)
  let last: QueryDocumentSnapshot | null = null
  try {
    for (;;) {
      let q = base.limit(pageSize)
      if (last) q = q.startAfter(last)
      const snap = await q.get()
      if (snap.empty) return
      yield snap.docs.map((d) => fromSnap(table, d))
      if (snap.size < pageSize) return
      last = snap.docs[snap.docs.length - 1]!
    }
  } catch (err) {
    if (last || !isMissingIndex(err)) throw err
    warnMissingIndex(table, err)
    const rows = await inMemory(table, conds, opts)
    for (let i = 0; i < rows.length; i += pageSize) yield rows.slice(i, i + pageSize)
  }
}

/** Get one row by its id column (or doc key for key-only tables). */
export async function get<T extends AnyTable>(table: T, id: string | number | null | undefined): Promise<RowOf<T> | null> {
  if (id === null || id === undefined || id === '') return null
  if (idIsDocKey(table) || !table.idField) {
    const snap = await refById(table, id).get()
    return snap.exists ? fromSnap(table, snap) : null
  }
  return findOne(table, { where: [[table.idField, '==', id]] as Conds<RowOf<T>> })
}

/** Get a row by its natural doc key (e.g. `{ teamId, userId }` for team_members). */
export async function getByKey<T extends AnyTable>(table: T, key: Partial<RowOf<T>>): Promise<RowOf<T> | null> {
  const snap = await col(table).doc(docIdFor(table, key)).get()
  return snap.exists ? fromSnap(table, snap) : null
}

/** Batch-get by ids (duplicates / nulls ignored). Order is not guaranteed. */
export async function getMany<T extends AnyTable>(
  table: T,
  ids: readonly (string | number | null | undefined)[]
): Promise<RowOf<T>[]> {
  const byKey = new Map<string, string | number>()
  for (const x of ids) if (x !== null && x !== undefined && x !== '' && !byKey.has(String(x))) byKey.set(String(x), x)
  const unique = [...byKey.keys()]
  if (unique.length === 0) return []
  if (!idIsDocKey(table) && table.idField) {
    return find(table, { where: [[table.idField, 'in', [...byKey.values()]]] as Conds<RowOf<T>> })
  }
  const out: RowOf<T>[] = []
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((id) => refById(table, id))
    const snaps = await fdb().getAll(...refs)
    for (const s of snaps) if (s.exists) out.push(fromSnap(table, s))
  }
  return out
}

/** Batch-get into a Map keyed by `String(id)`. */
export async function getManyMap<T extends AnyTable>(
  table: T,
  ids: readonly (string | number | null | undefined)[]
): Promise<Map<string, RowOf<T>>> {
  const rows = await getMany(table, ids)
  const key = (table.idField ?? table.docKey[0]) as string
  return new Map(rows.map((r) => [String((r as Record<string, unknown>)[key]), r]))
}

export async function count<T extends AnyTable>(table: T, where?: Conds<RowOf<T>>): Promise<number> {
  const conds = cleanConds(where) as Cond<unknown>[]
  if (conds.some(([, op, v]) => (op === 'in' || op === 'array-contains-any') && Array.isArray(v) && v.length === 0)) return 0
  const simple = conds.every(([, op, v]) => !((op === 'in' || op === 'not-in' || op === 'array-contains-any') && (v as unknown[]).length > (op === 'not-in' ? 10 : IN_LIMIT)))
  if (simple) {
    try {
      const snap = await applyConds(col(table), conds).count().get()
      return snap.data().count
    } catch (err) {
      if (!isMissingIndex(err)) throw err
      warnMissingIndex(table, err)
    }
  }
  return (await find(table, { where })).length
}

export async function sum<T extends AnyTable>(
  table: T,
  field: keyof RowOf<T> & string,
  where?: Conds<RowOf<T>>
): Promise<number> {
  const conds = cleanConds(where) as Cond<unknown>[]
  const simple = conds.every(([, op, v]) => !((op === 'in' || op === 'not-in') && (v as unknown[]).length > (op === 'not-in' ? 10 : IN_LIMIT)))
  if (simple && !conds.some(([, op, v]) => op === 'in' && (v as unknown[]).length === 0)) {
    try {
      const snap = await applyConds(col(table), conds).aggregate({ total: AggregateField.sum(field) }).get()
      return Number(snap.data().total ?? 0)
    } catch (err) {
      if (!isMissingIndex(err)) throw err
      warnMissingIndex(table, err)
    }
  }
  const rows = await find(table, { where })
  return rows.reduce((acc, r) => acc + Number((r as Record<string, unknown>)[field] ?? 0), 0)
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Insert one row (defaults, ids and timestamps filled like Postgres did). Throws on duplicate key. */
export async function insert<T extends AnyTable>(table: T, data: InsertOf<T>): Promise<RowOf<T>> {
  const needsSeq = table.idGen === 'seq' && table.idField && (data as Record<string, unknown>)[table.idField] == null
  const seq = needsSeq ? await nextSeq(table.name) : undefined
  const row = buildRow(table, data, new Date(), seq)
  const id = docIdFor(table, row)
  try {
    await col(table).doc(id).create(toDoc(table, row))
  } catch (err) {
    if (isAlreadyExists(err)) throw new UniqueViolationError(table.name, id)
    throw err
  }
  return row
}

/** Insert many rows in batches. Existing docs with the same key are overwritten. */
export async function insertMany<T extends AnyTable>(table: T, data: readonly InsertOf<T>[]): Promise<RowOf<T>[]> {
  if (data.length === 0) return []
  const needSeq = table.idGen === 'seq' && table.idField
    ? data.filter((d) => (d as Record<string, unknown>)[table.idField!] == null).length
    : 0
  let seq = needSeq ? await nextSeq(table.name, needSeq) : 0
  const now = new Date()
  const rows = data.map((d) => {
    const usesSeq = needSeq && (d as Record<string, unknown>)[table.idField!] == null
    return buildRow(table, d, now, usesSeq ? seq++ : undefined)
  })
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = fdb().batch()
    for (const r of rows.slice(i, i + BATCH_LIMIT)) batch.set(col(table).doc(docIdFor(table, r)), toDoc(table, r))
    await batch.commit()
  }
  return rows
}

/** Insert unless a row with the same doc key exists (Postgres `ON CONFLICT DO NOTHING`). Returns null when skipped. */
export async function insertIgnore<T extends AnyTable>(table: T, data: InsertOf<T>): Promise<RowOf<T> | null> {
  try {
    return await insert(table, data)
  } catch (err) {
    if (err instanceof UniqueViolationError) return null
    throw err
  }
}

/**
 * Insert or update by doc key (Postgres `ON CONFLICT (...) DO UPDATE`).
 * `onConflict` is the patch applied when the row exists (defaults to all given fields).
 */
export async function upsert<T extends AnyTable>(
  table: T,
  data: InsertOf<T>,
  onConflict?: Patch<RowOf<T>>
): Promise<RowOf<T>> {
  const probe = buildRow(table, data, new Date(), 0)
  const ref = col(table).doc(docIdFor(table, probe))
  const snap = await ref.get()
  if (snap.exists) {
    const existing = fromSnap(table, snap)
    const patch = (onConflict ?? stripUndefined(data as Record<string, unknown>)) as Patch<RowOf<T>>
    return applyPatch(table, ref, existing, patch)
  }
  return insert(table, data)
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

async function applyPatch<T extends AnyTable>(
  table: T,
  ref: DocumentReference,
  existing: RowOf<T>,
  patch: Patch<RowOf<T>>
): Promise<RowOf<T>> {
  const merged: Record<string, unknown> = { ...(existing as Record<string, unknown>) }
  const write: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !table.columns.includes(k)) continue
    if (isIncrement(v)) {
      merged[k] = Number(merged[k] ?? 0) + v.__increment
      write[k] = FieldValue.increment(v.__increment)
    } else {
      merged[k] = v
      write[k] = encodeValue(v)
    }
  }
  const row = merged as RowOf<T>
  const newId = docIdFor(table, row)
  if (newId !== ref.id) {
    // A doc-key field changed: move the document.
    const batch = fdb().batch()
    batch.delete(ref)
    batch.set(col(table).doc(newId), toDoc(table, row))
    await batch.commit()
    return row
  }
  if (table.derive) Object.assign(write, encodeValue(table.derive(row)) as Record<string, unknown>)
  if (Object.keys(write).length > 0) await ref.update(write)
  return row
}

/** Update one row by id. Returns the updated row, or null when it does not exist. */
export async function update<T extends AnyTable>(
  table: T,
  id: string | number | null | undefined,
  patch: Patch<RowOf<T>>
): Promise<RowOf<T> | null> {
  if (id === null || id === undefined || id === '') return null
  const ref = await refForId(table, id)
  if (!ref) return null
  const snap = await ref.get()
  if (!snap.exists) return null
  return applyPatch(table, ref, fromSnap(table, snap), patch)
}

/** Update a row by its natural doc key. */
export async function updateByKey<T extends AnyTable>(
  table: T,
  key: Partial<RowOf<T>>,
  patch: Patch<RowOf<T>>
): Promise<RowOf<T> | null> {
  const ref = col(table).doc(docIdFor(table, key))
  const snap = await ref.get()
  if (!snap.exists) return null
  return applyPatch(table, ref, fromSnap(table, snap), patch)
}

/**
 * Blind batched updates by id (no read, no derived-field refresh) — for bulk counters/orderings.
 * Only use for fields that do not feed `derive` (e.g. priority, sortOrder).
 */
export async function patchMany<T extends AnyTable>(
  table: T,
  items: readonly { id: string | number; patch: Patch<RowOf<T>> }[]
): Promise<void> {
  if (items.length === 0) return
  if (!idIsDocKey(table)) {
    for (const it of items) await update(table, it.id, it.patch)
    return
  }
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = fdb().batch()
    for (const { id, patch } of items.slice(i, i + BATCH_LIMIT)) {
      const write: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || !table.columns.includes(k)) continue
        write[k] = isIncrement(v) ? FieldValue.increment(v.__increment) : encodeValue(v)
      }
      if (Object.keys(write).length > 0) batch.update(refById(table, id), write)
    }
    await batch.commit()
  }
}

/** Update every matching row; returns the updated rows. */
export async function updateWhere<T extends AnyTable>(
  table: T,
  where: Conds<RowOf<T>>,
  patch: Patch<RowOf<T>>
): Promise<RowOf<T>[]> {
  const rows = await find(table, { where })
  const out: RowOf<T>[] = []
  for (const r of rows) {
    out.push(await applyPatch(table, col(table).doc(docIdFor(table, r)), r, patch))
  }
  return out
}

/** Delete one row by id; returns the deleted row or null. */
export async function remove<T extends AnyTable>(table: T, id: string | number | null | undefined): Promise<RowOf<T> | null> {
  if (id === null || id === undefined || id === '') return null
  const ref = await refForId(table, id)
  if (!ref) return null
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.delete()
  return fromSnap(table, snap)
}

export async function removeByKey<T extends AnyTable>(table: T, key: Partial<RowOf<T>>): Promise<RowOf<T> | null> {
  const ref = col(table).doc(docIdFor(table, key))
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.delete()
  return fromSnap(table, snap)
}

/** Delete every matching row; returns the deleted rows. */
export async function removeWhere<T extends AnyTable>(table: T, where: Conds<RowOf<T>>): Promise<RowOf<T>[]> {
  const conds = cleanConds(where)
  if (conds.length === 0) throw new Error(`[fsdb] refusing to delete all of ${table.name} without a condition`)
  const rows = await find(table, { where })
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = fdb().batch()
    for (const r of rows.slice(i, i + BATCH_LIMIT)) batch.delete(col(table).doc(docIdFor(table, r)))
    await batch.commit()
  }
  return rows
}
