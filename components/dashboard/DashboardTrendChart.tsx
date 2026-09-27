'use client'

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useTheme } from '@/components/providers/ThemeProvider'
import type { DashboardTrendPoint } from '@/lib/admin-dashboard'

/** Created vs closed support tickets per day. */
export default function DashboardTrendChart({ data }: { data: DashboardTrendPoint[] }) {
  const { resolved } = useTheme()
  const dark = resolved === 'dark'
  const grid = dark ? '#1E293B' : '#EEF2F6'
  const axis = dark ? '#64748B' : '#94A3B8'
  return (
    <div style={{ width: '100%', height: 280, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="dashCreated" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F9D8A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0F9D8A" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="dashClosed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${grid}`,
              background: dark ? '#16213A' : '#fff',
              color: dark ? '#E2E8F0' : '#0F172A',
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="created" name="Created" stroke="#0F9D8A" strokeWidth={2} fill="url(#dashCreated)" />
          <Area type="monotone" dataKey="closed" name="Closed" stroke="#F59E0B" strokeWidth={2} fill="url(#dashClosed)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
