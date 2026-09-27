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
    redirect('/login')
  }

  if (session.user.mustChangePassword) {
    const pathname = (await headers()).get('x-pathname')
    if (pathname && pathname !== '/change-password') {
      redirect('/change-password')
    }
  }

  return <>{children}</>
}
