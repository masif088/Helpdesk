'use client'

import { EyeOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Tooltip, Typography } from 'antd'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getFirebaseApp, isFirebaseClientConfigured } from '@/lib/firebase/client'

const { Text } = Typography

/** Treat viewer as still “online” on the ticket page if heartbeat is within this window (ms). */
const VIEWER_TTL_MS = 40_000
const HEARTBEAT_MS = 12_000

export type TicketPresenceViewer = {
  userId: string
  displayName: string
  photoUrl: string | null
  lastSeenMs: number
}

type Props = {
  ticketId: number
  currentUser: {
    id: string
    name?: string | null
    image?: string | null
  }
}

export default function TicketPresenceBar({ ticketId, currentUser }: Props) {
  const [viewers, setViewers] = useState<TicketPresenceViewer[]>([])
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const viewerDocRef = useRef<ReturnType<typeof doc> | null>(null)

  const ticketKey = String(ticketId)

  /** Other people currently viewing this ticket (excluding you). */
  const otherViewers = useMemo(
    () => viewers.filter((v) => v.userId !== currentUser.id),
    [viewers, currentUser.id]
  )

  useEffect(() => {
    if (!isFirebaseClientConfigured()) return

    const app = getFirebaseApp()
    if (!app) return

    const auth = getAuth(app)
    let unsubSnap: (() => void) | undefined

    const writePresence = (uid: string) => {
      const fs = getFirestore(app)
      const ref = doc(fs, 'ticket_presence', ticketKey, 'viewers', uid)
      viewerDocRef.current = ref
      void setDoc(
        ref,
        {
          userId: uid,
          displayName: (currentUser.name || currentUser.id).slice(0, 200),
          photoUrl: currentUser.image?.trim() || null,
          lastSeen: serverTimestamp(),
        },
        { merge: true }
      )
    }

    const clearHeartbeat = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSnap?.()
      unsubSnap = undefined
      clearHeartbeat()

      if (!user) {
        setViewers([])
        viewerDocRef.current = null
        return
      }

      const fs = getFirestore(app)
      const col = collection(fs, 'ticket_presence', ticketKey, 'viewers')

      unsubSnap = onSnapshot(col, (snap) => {
        const now = Date.now()
        const next: TicketPresenceViewer[] = []
        snap.forEach((d) => {
          const data = d.data()
          const uid = typeof data.userId === 'string' ? data.userId : d.id
          const ls = data.lastSeen as Timestamp | undefined
          const lastSeenMs = ls?.toMillis?.() ?? 0
          if (!lastSeenMs || now - lastSeenMs > VIEWER_TTL_MS) return
          next.push({
            userId: uid,
            displayName: String(data.displayName || uid).slice(0, 200),
            photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
            lastSeenMs,
          })
        })
        next.sort((a, b) => b.lastSeenMs - a.lastSeenMs)
        setViewers(next)
      })

      writePresence(user.uid)
      heartbeatRef.current = setInterval(() => writePresence(user.uid), HEARTBEAT_MS)
    })

    const onHidden = () => {
      const ref = viewerDocRef.current
      if (!ref) return
      void deleteDoc(ref).catch(() => {})
      viewerDocRef.current = null
    }

    window.addEventListener('pagehide', onHidden)

    return () => {
      window.removeEventListener('pagehide', onHidden)
      unsubAuth()
      unsubSnap?.()
      clearHeartbeat()
      const ref = viewerDocRef.current
      if (ref) {
        void deleteDoc(ref).catch(() => {})
      }
      viewerDocRef.current = null
    }
  }, [ticketKey, currentUser.id, currentUser.name, currentUser.image])

  if (!isFirebaseClientConfigured()) return null
  if (otherViewers.length === 0) return null

  const label = otherViewers.map((v) => v.displayName).join(', ')

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <Tooltip title={`Also viewing: ${label}`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <EyeOutlined style={{ color: '#0E7490', fontSize: 18 }} />
          <Avatar.Group max={{ count: 4 }} size="small">
            {otherViewers.map((v) => (
              <Tooltip key={v.userId} title={v.displayName}>
                <Avatar src={v.photoUrl || undefined} icon={!v.photoUrl ? <UserOutlined /> : undefined}>
                  {!v.photoUrl ? (v.displayName.slice(0, 1).toUpperCase() || '?') : undefined}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
          <Text type="secondary" style={{ fontSize: 13, maxWidth: 220 }} ellipsis>
            {otherViewers.length === 1
              ? otherViewers[0].displayName
              : `${otherViewers.length} viewing`}
          </Text>
        </span>
      </Tooltip>
    </div>
  )
}
