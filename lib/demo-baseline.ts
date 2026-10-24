/**
 * Rollback point for demos: a copy of all data (every top-level collection) that can be put back later with one button.
 *
 *   save     copies each document to `_baseline_data/{collection}~{id}` and writes an info document with the date and counts
 *   restore  empties every collection, writes the copies back, and makes the sign-in accounts match the copy
 *            (accounts the copy does not know are removed; missing ones are created without a password, so reset it from Users)
 *
 * Not copied: live-update leftovers (ticket_presence, ticket_data_sync) and notifications under users. What is decided where is in
 * lib/demo-reset-plan.ts.
 */
import { authDiff, BASELINE_DATA_COLLECTION, BASELINE_META_COLLECTION, baselineDocId, DEMO_RESET_OPERATOR, inBaseline, keptWhileRestoring } from '@/lib/demo-reset-plan'
import { getFirebaseAdminAuth } from '@/lib/firebase/admin'
import { createAuthUser, deleteAuthUser } from '@/lib/firebase/auth-server'
import { fdb } from '@/lib/fsdb'
import { refreshSlaReport } from '@/lib/sla-report-cache'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

const META_DOC = 'info'

export type BaselineInfo = { savedAt: string; savedBy: string; collections: Record<string, number>; accounts: number }

export async function getBaselineInfo(): Promise<BaselineInfo | null> {
  const snap = await fdb().collection(BASELINE_META_COLLECTION).doc(META_DOC).get()
  return snap.exists ? (snap.data() as BaselineInfo) : null
}

export async function saveBaseline(actorEmail: string): Promise<BaselineInfo> {
  const db = fdb()
  const cols = (await db.listCollections()).filter((c) => inBaseline(c.id))
  await db.recursiveDelete(db.collection(BASELINE_DATA_COLLECTION)) // replace the previous rollback point

  const writer = db.bulkWriter()
  const collections: Record<string, number> = {}
  let accounts = 0
  for (const c of cols) {
    const snap = await c.get()
    collections[c.id] = snap.size
    if (c.id === 'users') accounts = snap.size
    for (const d of snap.docs) writer.set(db.collection(BASELINE_DATA_COLLECTION).doc(baselineDocId(c.id, d.id)), { c: c.id, id: d.id, data: d.data() })
  }
  await writer.close()

  const info: BaselineInfo = { savedAt: new Date().toISOString(), savedBy: actorEmail, collections, accounts }
  await db.collection(BASELINE_META_COLLECTION).doc(META_DOC).set(info)
  return info
}

export type RestoreResult = { steps: { step: string; detail: string; ok: boolean }[]; ok: boolean }

export async function restoreBaseline(): Promise<RestoreResult> {
  const db = fdb()
  const info = await getBaselineInfo()
  if (!info) throw new Error('There is no rollback point yet; nothing was changed')
  const saved = await db.collection(BASELINE_DATA_COLLECTION).get()
  const users = saved.docs.map((d) => d.data() as { c: string; id: string; data: Record<string, unknown> }).filter((d) => d.c === 'users')
  if (!users.some((u) => String(u.data.email ?? '').toLowerCase() === DEMO_RESET_OPERATOR)) throw new Error('The rollback point does not contain the operator account; nothing was changed')

  const steps: RestoreResult['steps'] = []
  const run = async (step: string, fn: () => Promise<string>) => {
    try {
      steps.push({ step, detail: await fn(), ok: true })
    } catch (e) {
      steps.push({ step, detail: (e as Error).message, ok: false })
    }
  }

  await run('Empty current data', async () => {
    const cols = (await db.listCollections()).filter((c) => !keptWhileRestoring(c.id))
    for (const c of cols) await db.recursiveDelete(c)
    return `${cols.length} collections emptied`
  })

  await run('Write the rollback point back', async () => {
    const writer = db.bulkWriter()
    for (const d of saved.docs) {
      const { c, id, data } = d.data() as { c: string; id: string; data: Record<string, unknown> }
      writer.set(db.collection(c).doc(id), data)
    }
    await writer.close()
    return `${saved.size} documents`
  })

  await run('Accounts', async () => {
    const auth = getFirebaseAdminAuth()
    if (!auth) throw new Error('Firebase Auth is not configured')
    const current: { uid: string; email: string | null }[] = []
    let page = await auth.listUsers(1000)
    for (;;) {
      current.push(...page.users.map((u) => ({ uid: u.uid, email: u.email ?? null })))
      if (!page.pageToken) break
      page = await auth.listUsers(1000, page.pageToken)
    }
    const diff = authDiff(current, new Set(users.map((u) => u.id)), DEMO_RESET_OPERATOR)
    for (const uid of diff.remove) await deleteAuthUser(uid)
    for (const uid of diff.missing) {
      const u = users.find((x) => x.id === uid)!
      await createAuthUser({ uid, email: String(u.data.email), displayName: (u.data.fullName as string | null) ?? null })
    }
    return `${diff.remove.length} removed, ${diff.missing.length} re-created without a password`
  })

  await run('Caches', async () => {
    revalidateTicketsLookupCatalog()
    refreshSlaReport()
    return 'refreshed'
  })

  return { steps, ok: steps.every((s) => s.ok) }
}
