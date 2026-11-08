/**
 * The call log of API keys and connections on the server: one record per call in `api_key_calls` (what, when, which MCP tool), kept
 * for 30 days and read newest first for the keys pages. Words for a call and the id scheme: `lib/api-key-calls-core.ts`.
 */
import { randomBytes } from 'node:crypto'

import { FieldPath } from 'firebase-admin/firestore'

import { CALL_LOG_DAYS, CALL_LOG_LIMIT, callDocId, type CallEntry, callIdRange } from '@/lib/api-key-calls-core'
import { fdb } from '@/lib/fsdb/firestore'

const COLLECTION = 'api_key_calls'

/** Remember one call (fire and forget: it never slows or breaks the call). */
export function logApiCall(c: { keyId: string; scope: string; method: string; path: string; query: string; tool: string | null; limited: boolean }): void {
  if (!c.method || !c.path) return
  const at = new Date()
  const id = callDocId(c.keyId, at, randomBytes(3).toString('hex'))
  void fdb()
    .collection(COLLECTION)
    .doc(id)
    .set({ id, keyId: c.keyId, at, method: c.method, path: c.path, query: c.query, scope: c.scope, tool: c.tool, limited: c.limited })
    .catch((e) => console.error('[api-key-calls]', e))
}

/** The latest calls of one key, newest first. */
export async function loadKeyCalls(keyId: string, limit = CALL_LOG_LIMIT): Promise<CallEntry[]> {
  const { from, to } = callIdRange(keyId)
  const snap = await fdb()
    .collection(COLLECTION)
    .where(FieldPath.documentId(), '>=', from)
    .where(FieldPath.documentId(), '<', to)
    .orderBy(FieldPath.documentId())
    .limit(limit)
    .get()
  return snap.docs.map((d) => {
    const v = d.data() as Record<string, unknown>
    const at = v.at as { toDate?: () => Date } | Date | undefined
    return {
      id: d.id,
      at: (typeof (at as { toDate?: () => Date })?.toDate === 'function' ? (at as { toDate: () => Date }).toDate() : (at as Date) ?? new Date()).toISOString(),
      method: String(v.method ?? ''),
      path: String(v.path ?? ''),
      query: String(v.query ?? ''),
      scope: String(v.scope ?? ''),
      tool: typeof v.tool === 'string' ? v.tool : null,
      limited: v.limited === true,
    }
  })
}

/** Remove calls older than the log keeps (a batch at a time; the hourly job calls this). */
export async function purgeOldApiCalls(now = new Date(), days = CALL_LOG_DAYS, max = 400): Promise<number> {
  const snap = await fdb().collection(COLLECTION).where('at', '<', new Date(now.getTime() - days * 86_400_000)).limit(max).get()
  if (snap.empty) return 0
  const batch = fdb().batch()
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}
