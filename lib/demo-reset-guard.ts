/**
 * Safety catch for Demo reset and its rollback point. The page and API refuse to do anything until someone flips a switch
 * by hand in the database (Firebase Console -> Firestore): collection `_guards`, document `demo_reset`, field `enabled`
 * (boolean) = true. The app itself can never turn it on, and it switches itself off again after one use, so every reset
 * needs a fresh manual unlock.
 */
import { DEMO_RESET_GUARD } from '@/lib/demo-reset-plan'
import { fdb } from '@/lib/fsdb/firestore'

const ref = () => fdb().collection(DEMO_RESET_GUARD.collection).doc(DEMO_RESET_GUARD.doc)

/** Only a real boolean `true` unlocks; "true" (text), 1 or a missing document do not. */
export async function isDemoResetUnlocked(): Promise<boolean> {
  const snap = await ref().get()
  return snap.exists && snap.get(DEMO_RESET_GUARD.field) === true
}

/** Switch the catch back on (called after a reset, restore or save has run). The document is kept so it is easy to find. */
export async function lockDemoReset(): Promise<void> {
  await ref().set({ [DEMO_RESET_GUARD.field]: false, lockedAt: new Date() }, { merge: true })
}
