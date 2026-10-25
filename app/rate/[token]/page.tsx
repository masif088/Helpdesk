import { notFound } from 'next/navigation'

import { getAppSettings } from '@/lib/app-settings'
import { BRANDING } from '@/lib/branding'
import { ticketForRatingToken } from '@/lib/csat'
import { FINISHED_STATUSES } from '@/lib/sla'

import RateForm from './RateForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rate your ticket', robots: { index: false, follow: false } }

/** Public page behind the "Rate this ticket" links of the closing email: the signed link stands in for the login. */
export default async function RatePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string }> }) {
  const { token } = await params
  const ticket = await ticketForRatingToken(token)
  if (!ticket) notFound()
  const [{ r }, settings] = await Promise.all([searchParams, getAppSettings()])
  const preset = Number(r)

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <p style={{ opacity: 0.6, margin: '0 0 8px' }}>{settings.app_name || BRANDING.name}</p>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>How did we do?</h1>
        <p style={{ margin: '0 0 20px' }}>
          Ticket #{ticket.id}: <strong>{ticket.title}</strong>
        </p>
        {FINISHED_STATUSES.has(ticket.status) ? (
          <RateForm
            token={token}
            initialRating={ticket.csatRating ?? (Number.isInteger(preset) && preset >= 1 && preset <= 5 ? preset : 0)}
            initialComment={ticket.csatComment ?? ''}
            alreadyRated={!!ticket.csatRating}
          />
        ) : (
          <p>This ticket is not resolved yet, so it cannot be rated. Please use this link again once it is.</p>
        )}
      </div>
    </main>
  )
}
