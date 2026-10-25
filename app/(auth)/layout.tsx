import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    // `reason` tells the proxy this is not a normal visit: the cookie it still accepts belongs to no user, so it is dropped
    redirect('/login?reason=no_session')
  }

  if (session.user.mustChangePassword) {
    const pathname = (await headers()).get('x-pathname')
    if (pathname && pathname !== '/change-password') {
      redirect('/change-password')
    }
  }

  return <>{children}</>
}
