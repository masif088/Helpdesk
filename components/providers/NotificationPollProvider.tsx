'use client'

import { App } from 'antd'
import { useRouter } from 'next/navigation'
import { createContext, type ReactNode,useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { useSession } from '@/lib/auth-client'

/** One global interval — keeps /api/notifications traffic low */
export const NOTIFICATION_POLL_INTERVAL_MS = 120_000

export type TicketNotificationItem = {
  id: string
  ticketId: number
  ticketTitle: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string | null
  actorUserId: string
  actorName: string
}

type Ctx = {
  items: TicketNotificationItem[]
  loading: boolean
  unreadCount: number
  readCount: number
  /** One-shot fetch (e.g. after mark-read); does not reset interval */
  refresh: () => Promise<void>
  setItems: React.Dispatch<React.SetStateAction<TicketNotificationItem[]>>
}

const NotificationPollContext = createContext<Ctx | null>(null)

export function useNotificationPoll(): Ctx {
  const v = useContext(NotificationPollContext)
  if (!v) {
    throw new Error('useNotificationPoll must be used within NotificationPollProvider')
  }
  return v
}

const decodeHtmlEntities = (text: string): string => {
  if (typeof document === 'undefined') return text
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

export default function NotificationPollProvider({ children }: { children: ReactNode }) {
  const { notification } = App.useApp()
  const router = useRouter()
  const { status, data: session } = useSession()
  const sessionUserId = session?.user?.id

  const [items, setItems] = useState<TicketNotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  const initialHydratedRef = useRef(false)
  const alertedIdsRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef(false)
  const notificationRef = useRef(notification)
  const routerRef = useRef(router)
  notificationRef.current = notification
  routerRef.current = router

  const enabled = status === 'authenticated'

  const fetchNotifications = useCallback(async () => {
    const res = await fetch('/api/notifications', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as { items?: TicketNotificationItem[] }
    return Array.isArray(data.items) ? data.items : []
  }, [])

  const processNewUnreadAlerts = useCallback((list: TicketNotificationItem[]) => {
    if (!initialHydratedRef.current) {
      initialHydratedRef.current = true
      for (const n of list) {
        if (!n.read) alertedIdsRef.current.add(n.id)
      }
      return
    }
    const nApi = notificationRef.current
    const nav = routerRef.current
    for (const n of list) {
      if (n.read || alertedIdsRef.current.has(n.id)) continue
      alertedIdsRef.current.add(n.id)
      nApi.info({
        message: n.title,
        description: decodeHtmlEntities(n.body),
        placement: 'topRight',
        duration: 10,
        onClick: () => {
          nApi.destroy()
          nav.push(`/tickets/${n.ticketId}`)
        },
      })
      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(n.title, { body: decodeHtmlEntities(n.body.slice(0, 200)), tag: `ticket-${n.id}` })
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  const tick = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    try {
      const list = await fetchNotifications()
      setItems(list)
      processNewUnreadAlerts(list)
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [fetchNotifications, processNewUnreadAlerts])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    initialHydratedRef.current = false
    alertedIdsRef.current = new Set()
  }, [sessionUserId])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      initialHydratedRef.current = false
      alertedIdsRef.current = new Set()
      return
    }

    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await tick()
    }

    void run()
    const interval = setInterval(() => void run(), NOTIFICATION_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, tick])

  const unreadCount = useMemo(() => items.filter((i) => !i.read).length, [items])
  const readCount = useMemo(() => items.filter((i) => i.read).length, [items])

  const refresh = useCallback(async () => {
    await tick()
  }, [tick])

  const value = useMemo(
    () => ({
      items,
      loading,
      unreadCount,
      readCount,
      refresh,
      setItems,
    }),
    [items, loading, unreadCount, readCount, refresh]
  )

  return <NotificationPollContext.Provider value={value}>{children}</NotificationPollContext.Provider>
}
