'use client'

import { Select } from 'antd'
import { useEffect, useState } from 'react'

import { MAX_SKILLS } from '@/lib/user-skills'

/** Skills picker: free-form labels, suggested from the skills agents already have so spelling stays one group. Works inside Form.Item. */
export default function SkillsSelect({
  value,
  onChange,
  placeholder = 'e.g. WordPress, Billing',
  disabled,
}: {
  value?: string[]
  onChange?: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [known, setKnown] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/users/skills', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { skill: string }[]) => alive && setKnown(Array.isArray(rows) ? rows.map((r) => r.skill) : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return (
    <Select
      mode="tags"
      value={value ?? []}
      onChange={onChange}
      placeholder={placeholder}
      tokenSeparators={[',']}
      maxCount={MAX_SKILLS}
      disabled={disabled}
      options={known.map((s) => ({ value: s, label: s }))}
      style={{ width: '100%' }}
    />
  )
}
