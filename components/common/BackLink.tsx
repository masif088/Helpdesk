'use client'

import { ArrowLeftOutlined } from '@ant-design/icons'
import type { CSSProperties, ReactNode } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'

/** Pill "← Back" control used on every page (style: .back-link in globals.css). Link with `href`, button with `onClick`. */
export default function BackLink({
  href,
  onClick,
  children,
  style,
}: {
  href?: string
  onClick?: () => void
  children: ReactNode
  style?: CSSProperties
}) {
  const inner = (
    <>
      <span className="back-link__icon" aria-hidden>
        <ArrowLeftOutlined />
      </span>
      <span className="back-link__label">{children}</span>
    </>
  )
  if (href) {
    return (
      <SpaNavLink href={href} className="back-link" style={style}>
        {inner}
      </SpaNavLink>
    )
  }
  return (
    <button type="button" className="back-link" onClick={onClick} style={style}>
      {inner}
    </button>
  )
}
