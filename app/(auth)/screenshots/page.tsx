import { auth } from '@/auth'
import ScreenshotsContent from '@/components/content/settings/ScreenshotsContent'
import { find, getManyMap, screenshots, tickets } from '@/lib/fsdb'

export default async function ScreenshotsPage() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const shots = await find(screenshots, {
    where: [['userId', '==', session.user.id]],
    orderBy: [['createdAt', 'desc']],
  })
  const ticketById = await getManyMap(tickets, shots.map((s) => s.ticketId))
  const screenshotsRows = shots.map((screenshot) => ({
    screenshot,
    ticket: screenshot.ticketId != null ? ticketById.get(String(screenshot.ticketId)) ?? null : null,
  }))

  const screenshotsData = screenshotsRows.map((r) => ({
    id: r.screenshot.id,
    file_name: r.screenshot.fileName,
    file_path: r.screenshot.filePath,
    file_url: r.screenshot.fileUrl,
    file_size: r.screenshot.fileSize ?? 0,
    mime_type: r.screenshot.mimeType ?? '',
    ticket_id: r.screenshot.ticketId,
    title: r.screenshot.title,
    description: r.screenshot.description,
    tags: r.screenshot.tags,
    created_at: r.screenshot.createdAt ? new Date(r.screenshot.createdAt).toISOString() : '',
    updated_at: r.screenshot.updatedAt ? new Date(r.screenshot.updatedAt).toISOString() : '',
    tickets: r.ticket
      ? { id: r.ticket.id, title: r.ticket.title, status: r.ticket.status }
      : null,
  }))

  const ticketsRows = await find(tickets, { orderBy: [['createdAt', 'desc']], limit: 100 })

  const ticketsData = ticketsRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
  }))

  return (
    <ScreenshotsContent
      user={session.user}
      screenshots={screenshotsData}
      tickets={ticketsData}
    />
  )
}
