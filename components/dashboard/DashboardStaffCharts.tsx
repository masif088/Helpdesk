'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useTheme } from '@/components/providers/ThemeProvider'

type ChartRow = { day: string; short: string; duration: number; fullMark: number }

/** Hours tracked per day (last 7 days) for the current user. */
export default function DashboardStaffCharts({ chartData }: { chartData: ChartRow[] }) {
  const { resolved } = useTheme()
  const dark = resolved === 'dark'
  const grid = dark ? '#1E293B' : '#EEF2F6'
  const axis = dark ? '#64748B' : '#94A3B8'
  return (
    <div style={{ width: '100%', height: 200, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="short" tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <Tooltip
            cursor={{ fill: dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,157,138,0.06)' }}
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${grid}`,
              background: dark ? '#16213A' : '#fff',
              color: dark ? '#E2E8F0' : '#0F172A',
            }}
            formatter={(value: number | undefined) => [`${value ?? 0} h`, 'Tracked']}
            labelFormatter={(label) => chartData.find((d) => d.short === label)?.day ?? label}
          />
          <Bar dataKey="duration" fill="#0F9D8A" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
