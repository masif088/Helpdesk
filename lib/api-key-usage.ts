/**
 * API key usage on the server: every call a key makes adds one to its record for the day (`api_key_usage`, one record per key per day),
 * and the keys pages read the totals. The adding up is in `lib/api-key-usage-core.ts`.
 */
import { FieldValue } from 'firebase-admin/firestore'

import { logApiCall } from '@/lib/api-key-calls'
import { createDeduper, type KeyUsage, lastDates, summarizeUsage, usageDate, usageDocId } from '@/lib/api-key-usage-core'
import { apiKeyUsage, find } from '@/lib/fsdb'
import { fdb } from '@/lib/fsdb/firestore'

// One deduper for the whole process, even when the bundler loads this file more than once
const g = globalThis as typeof globalThis & { __apiUsageOnce?: ReturnType<typeof createDeduper> }
const firstTime = (g.__apiUsageOnce ??= createDeduper())

/**
 * Count one call of a key (fire and forget: it never slows or breaks the call). `limited` = the call was refused for the hourly limit.
 * A request that asks for the session several times is counted once, by its request id.
 */
export function recordApiCall(call: { keyId: string; scope: string; limited: boolean; requestId: string | null; method?: string; path?: string; query?: string; tool?: string | null }): void {
  if (!firstTime(call.requestId)) return
  logApiCall({ keyId: call.keyId, scope: call.scope, method: call.method ?? '', path: call.path ?? '', query: call.query ?? '', tool: call.tool ?? null, limited: call.limited })
  const date = usageDate()
  const n = call.limited ? 0 : 1
  void fdb()
    .collection('api_key_usage')
    .doc(usageDocId(call.keyId, date))
    .set(
      {
        id: usageDocId(call.keyId, date),
        keyId: call.keyId,
        date,
        calls: FieldValue.increment(n),
        limited: FieldValue.increment(call.limited ? 1 : 0),
        scopes: { [call.scope]: FieldValue.increment(n) },
        updatedAt: new Date(),
      },
      { merge: true }
    )
    .catch((e) => console.error('[api-key-usage]', e))
}

/** Usage of the last 30 days per key id. Keys that were never used are not in the map. */
export async function loadKeyUsage(): Promise<Map<string, KeyUsage>> {
  const first = lastDates(new Date())[0]
  const rows = await find(apiKeyUsage, { where: [['date', '>=', first]] })
  return summarizeUsage(rows)
}
