'use client'

import { InputNumber, Select, Space } from 'antd'
import { useState } from 'react'

const UNITS = [
  { value: 1, label: 'minutes' },
  { value: 60, label: 'hours' },
  { value: 1440, label: 'days' },
]

/** The unit a number of minutes reads best in: 1440 -> days, 120 -> hours, 90 -> minutes. */
function unitFor(minutes: number | null | undefined): number {
  if (!minutes) return 60
  if (minutes % 1440 === 0) return 1440
  if (minutes % 60 === 0) return 60
  return 1
}

/** A duration stored in minutes, typed as a number + unit. Empty = no target. */
export default function SlaDurationInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value?: number | null
  onChange?: (minutes: number | null) => void
  placeholder?: string
  disabled?: boolean
}) {
  // The unit the person picked, while it can show the value with at most two decimals; else the one it reads best in
  const [picked, setPicked] = useState<number | null>(null)
  const fits = (u: number) => !value || Math.abs((value / u) * 100 - Math.round((value / u) * 100)) < 1e-9
  const unit = picked && fits(picked) ? picked : unitFor(value)

  const shown = value ? Math.round((value / unit) * 100) / 100 : null
  return (
    <Space.Compact style={{ width: '100%' }}>
      <InputNumber
        min={0}
        style={{ width: '100%' }}
        value={shown}
        placeholder={placeholder ?? 'No target'}
        disabled={disabled}
        onChange={(n) => onChange?.(n && n > 0 ? Math.max(1, Math.round(n * unit)) : null)}
      />
      <Select
        value={unit}
        style={{ width: 96 }}
        options={UNITS}
        disabled={disabled}
        onChange={(u) => {
          setPicked(u)
          // Keep the number on screen, change what it means
          if (shown) onChange?.(Math.max(1, Math.round(shown * u)))
        }}
      />
    </Space.Compact>
  )
}
