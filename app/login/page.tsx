import { redirect } from 'next/navigation'

import { needsSetup } from '@/lib/setup'

import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

/** A brand-new database has no users to sign in with: send the visitor to the first-run setup instead. */
export default async function LoginPage() {
  if (await needsSetup()) redirect('/setup')
  return <LoginForm />
}
