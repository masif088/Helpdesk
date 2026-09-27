/**
 * Dev diagnostics: with FSDB_TRACE=1 every Firestore round trip is logged as
 * `[fsdb] <op> <path> <ms>ms`, so slow endpoints can be traced to the calls they make.
 */
import {
  AggregateQuery,
  CollectionReference,
  DocumentReference,
  Firestore,
  Query,
  WriteBatch,
} from 'firebase-admin/firestore'

const g = globalThis as typeof globalThis & { __fsdbTraceInstalled?: boolean }

function wrap<T extends object>(proto: T, method: string, label: (self: unknown) => string) {
  const orig = (proto as Record<string, unknown>)[method] as (...a: unknown[]) => Promise<unknown>
  if (typeof orig !== 'function') return
  ;(proto as Record<string, unknown>)[method] = async function (this: unknown, ...args: unknown[]) {
    const t0 = Date.now()
    try {
      return await orig.apply(this, args)
    } finally {
      console.log(`[fsdb] ${method} ${label(this)} ${Date.now() - t0}ms`)
    }
  }
}

export function installFsdbTrace(): void {
  if (process.env.FSDB_TRACE !== '1' || g.__fsdbTraceInstalled) return
  g.__fsdbTraceInstalled = true
  const docPath = (self: unknown) => (self as DocumentReference).path
  const queryPath = (self: unknown) => {
    const q = self as Query & { _queryOptions?: { collectionId?: string } }
    return q instanceof CollectionReference ? q.path : `query:${q._queryOptions?.collectionId ?? '?'}`
  }
  for (const m of ['get', 'set', 'update', 'delete', 'create']) wrap(DocumentReference.prototype, m, docPath)
  wrap(Query.prototype, 'get', queryPath)
  wrap(WriteBatch.prototype, 'commit', () => 'batch')
  wrap(AggregateQuery.prototype, 'get', () => 'aggregate')
  wrap(Firestore.prototype, 'getAll', () => 'getAll')
  wrap(Firestore.prototype, 'runTransaction', () => 'transaction')
}
