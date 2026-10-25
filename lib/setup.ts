/**
 * First-run setup: a brand-new database has no users, so nobody can sign in. While that is the case the login page sends
 * visitors to /setup, where they create the first admin account and name the app. The page and API refuse as soon as one
 * user exists. Set SETUP_TOKEN on a public server to also require that value, so a stranger cannot claim the app first.
 */
import { timingSafeEqual } from 'node:crypto'

import { setAppSetting } from '@/lib/app-settings'
import { createAppUser, findUserByEmail } from '@/lib/app-users'
import { count, users } from '@/lib/fsdb'
import { seedDefaults } from '@/lib/seed-defaults'

export const SETUP_MIN_PASSWORD = 8

/** True while the database has no users. Errors (database not reachable) count as "no": the login page shows them. */
export async function needsSetup(): Promise<boolean> {
  // Not cached: it is one cheap count, only asked on the login and setup pages, and it must notice users being deleted
  try {
    return (await count(users)) === 0
  } catch {
    return false
  }
}

export const setupTokenRequired = (): boolean => !!process.env.SETUP_TOKEN?.trim()

function tokenOk(given: unknown): boolean {
  const want = process.env.SETUP_TOKEN?.trim()
  if (!want) return true
  const a = Buffer.from(String(given ?? '').trim())
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

export class SetupError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export type SetupInput = { appName?: unknown; name?: unknown; email?: unknown; password?: unknown; token?: unknown }

/** Create the starting data, the app name and the first admin. Throws SetupError when it must not run. */
export async function runSetup(input: SetupInput): Promise<{ email: string }> {
  if (!(await needsSetup())) throw new SetupError('The app is already set up', 409)
  if (!tokenOk(input.token)) throw new SetupError('The setup token is not correct', 403)

  const appName = String(input.appName ?? '').trim().slice(0, 80)
  const name = String(input.name ?? '').trim().slice(0, 120)
  const email = String(input.email ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  if (!appName) throw new SetupError('Enter a name for the app', 400)
  if (!name) throw new SetupError('Enter your name', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SetupError('Enter a valid email address', 400)
  if (password.length < SETUP_MIN_PASSWORD) throw new SetupError(`The password must be at least ${SETUP_MIN_PASSWORD} characters`, 400)
  if (await findUserByEmail(email)) throw new SetupError('That email is already in use', 409)

  await seedDefaults()
  await setAppSetting('app_name', appName)
  await createAppUser({ email, password, fullName: name, role: 'admin', status: 'active' })
  return { email }
}
