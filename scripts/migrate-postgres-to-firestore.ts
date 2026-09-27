/**
 * One-time import: Postgres (old database) → Firestore + Firebase Auth.
 *
 *   npm run migrate:firestore -- [--dry-run] [--tables=users,tickets] [--skip-auth]
 *
 * Env:
 *   DATABASE_URL                 source Postgres (read-only use)
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY   target project
 *
 * What it does
 *   - Copies every table used by the app into the Firestore collection with the same name. Document ids
 *     are the old primary keys (or the natural unique key, see lib/fsdb/schema.ts), so ids / URLs stay the same.
 *   - Rebuilds derived search fields (keywords, lower-cased emails) through the normal write path.
 *   - Raises `_counters/{table}` to MAX(id) for integer-id tables so new tickets continue the numbering.
 *   - Imports users into Firebase Auth with uid = users.id and their existing bcrypt hash, so everyone
 *     keeps their current password. Users without a hash get an account without password (reset needed).
 *
 * Re-running is safe: documents are overwritten with the same ids.
 */
import 'dotenv/config'

import type { UserImportRecord } from 'firebase-admin/auth'
import postgres from 'postgres'

import { getFirebaseAdminAuth, isFirebaseAdminConfigured } from '../lib/firebase/admin'
import { allTables, type AnyTable, ensureSeqAtLeast, insertMany } from '../lib/fsdb'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipAuth = args.includes('--skip-auth')
const onlyTables = args.find((a) => a.startsWith('--tables='))?.slice('--tables='.length).split(',').filter(Boolean)

/** Columns stored as calendar-day strings ('YYYY-MM-DD'); postgres.js returns them as Date. */
const DATE_ONLY = new Set(['company_daily_active_assignments.snapshotDate', 'recurring_tickets.startDate', 'recurring_tickets.endDate'])
/** int8 columns (postgres.js returns them as strings). */
const BIGINT = new Set(['companies.freshdeskId', 'ticket_comments.fdConversationId', 'screenshots.fileSize'])

const PAGE = 2000

function snake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function toRow(table: AnyTable, raw: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const col of table.columns) {
    let v = raw[snake(col)]
    const key = `${table.name}.${col}`
    if (v instanceof Date && DATE_ONLY.has(key)) v = v.toISOString().slice(0, 10)
    if (typeof v === 'string' && BIGINT.has(key) && /^-?\d+$/.test(v)) v = Number(v)
    if (typeof v === 'bigint') v = Number(v)
    row[col] = v === undefined ? null : v
  }
  return row
}

async function tableExists(sql: postgres.Sql, name: string): Promise<boolean> {
  const [r] = await sql`SELECT to_regclass(${'public.' + name}) AS t`
  return r?.t != null
}

async function copyTable(sql: postgres.Sql, table: AnyTable): Promise<number> {
  if (!(await tableExists(sql, table.name))) {
    console.log(`  - ${table.name}: not in Postgres, skipped`)
    return 0
  }
  const orderCol = table.docKey.map((c) => snake(c)).join(', ')
  let offset = 0
  let total = 0
  let maxId = 0
  for (;;) {
    const rows = await sql.unsafe(`SELECT * FROM "${table.name}" ORDER BY ${orderCol} LIMIT ${PAGE} OFFSET ${offset}`)
    if (rows.length === 0) break
    const mapped = rows.map((r) => toRow(table, r as Record<string, unknown>))
    if (table.idGen === 'seq' && table.idField) {
      for (const r of mapped) maxId = Math.max(maxId, Number(r[table.idField] ?? 0))
    }
    if (!dryRun) await insertMany(table, mapped)
    total += rows.length
    offset += rows.length
    if (rows.length < PAGE) break
  }
  if (!dryRun && table.idGen === 'seq' && maxId > 0) await ensureSeqAtLeast(table.name, maxId)
  console.log(`  ✓ ${table.name}: ${total} rows${table.idGen === 'seq' ? ` (counter → ${maxId})` : ''}`)
  return total
}

async function importAuthUsers(sql: postgres.Sql): Promise<void> {
  const auth = getFirebaseAdminAuth()
  if (!auth) throw new Error('Firebase Admin Auth is not available')
  const rows = await sql`SELECT * FROM users`
  const withHash: UserImportRecord[] = []
  const withoutHash: UserImportRecord[] = []
  for (const r of rows) {
    const email = String(r.email ?? '').trim().toLowerCase()
    if (!email) continue
    const rec: UserImportRecord = {
      uid: String(r.id),
      email,
      displayName: r.full_name ? String(r.full_name) : undefined,
      disabled: String(r.status ?? 'active').toLowerCase() !== 'active' || r.deleted_at != null,
    }
    const hash = r.password_hash ? String(r.password_hash) : ''
    if (/^\$2[aby]\$/.test(hash)) withHash.push({ ...rec, passwordHash: Buffer.from(hash) })
    else withoutHash.push(rec)
  }
  console.log(`  users with bcrypt hash: ${withHash.length}, without password: ${withoutHash.length}`)
  if (dryRun) return

  const run = async (list: UserImportRecord[], withBcrypt: boolean) => {
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000)
      const res = withBcrypt
        ? await auth.importUsers(chunk, { hash: { algorithm: 'BCRYPT' } })
        : await auth.importUsers(chunk)
      for (const e of res.errors) {
        console.warn(`  ! auth import failed for ${chunk[e.index]?.email}: ${e.error.message}`)
      }
      console.log(`  ✓ auth: imported ${res.successCount}/${chunk.length}`)
    }
  }
  await run(withHash, true)
  await run(withoutHash, false)
}

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL (source Postgres) is required')
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase Admin is not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)')
  }

  const cleanUrl = url.replace(/([?&])schema=[^&]*&?/, '$1').replace(/[?&]$/, '')
  const sql = postgres(cleanUrl, { prepare: false, max: 1 })
  console.log(`${dryRun ? '[dry-run] ' : ''}Copying Postgres → Firestore`)
  try {
    const tables = (allTables as readonly AnyTable[]).filter((t) => !onlyTables || onlyTables.includes(t.name))
    let grand = 0
    for (const t of tables) grand += await copyTable(sql, t)
    console.log(`Rows copied: ${grand}`)

    if (!skipAuth && (!onlyTables || onlyTables.includes('users'))) {
      console.log('Importing users into Firebase Auth (uid = users.id, bcrypt hashes kept)')
      await importAuthUsers(sql)
    }
  } finally {
    await sql.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
