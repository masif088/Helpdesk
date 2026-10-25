import { redirect } from 'next/navigation'

import { BRANDING } from '@/lib/branding'
import { needsSetup, setupTokenRequired } from '@/lib/setup'

import SetupForm from './SetupForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Set up', robots: { index: false, follow: false } }

/** First-run setup: only reachable while the database has no users. */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login')
  return <SetupForm defaultAppName={BRANDING.name} tokenRequired={setupTokenRequired()} />
}
