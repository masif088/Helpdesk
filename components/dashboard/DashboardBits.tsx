'use client'

import { Card, Typography } from 'antd'
import dayjs from 'dayjs'
import Link from 'next/link'
import type { ReactNode } from 'react'

const { Text } = Typography

/** Shared building blocks of the staff and customer dashboards. */

export function greeting() {
  const h = dayjs().hour()
  if (h < 11) return 'Good morning'
  if (h < 15) return 'Good afternoon'
  if (h < 19) return 'Good evening'
  return 'Good night'
}

export function KpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  icon: ReactNode
  tone: 'teal' | 'amber' | 'slate' | 'green'
  label: string
  value: ReactNode
  hint?: ReactNode
  href?: string
}) {
  const tones = {
    teal: { bg: 'var(--brand-primary-soft)', fg: 'var(--brand-primary)' },
    amber: { bg: 'rgba(245, 158, 11, 0.14)', fg: '#D97706' },
    slate: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
    green: { bg: 'rgba(22, 163, 74, 0.12)', fg: '#16A34A' },
  }[tone]
  const body = (
    <Card className="dash-kpi" styles={{ body: { padding: 18 } }} hoverable={!!href} style={{ height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: tones.bg,
            color: tones.fg,
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {label}
          </Text>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{value}</div>
          {hint ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {hint}
            </Text>
          ) : null}
        </div>
      </div>
    </Card>
  )
  return href ? (
    <Link href={href} style={{ display: 'block', height: '100%' }}>
      {body}
    </Link>
  ) : (
    body
  )
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontWeight: 650, fontSize: 15 }}>{children}</span>
      {extra}
    </div>
  )
}
