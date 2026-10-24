'use client'

import { Typography } from 'antd'
import type { CSSProperties } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

const { Text } = Typography

export type CustomerBarRow = {
  name: string
  count: number
  fill: string
  type_id: number | null
}

export type CustomerDonutRow = {
  name: string
  value: number
  fill: string
}

type Props = {
  barChartData: CustomerBarRow[]
  donutData: CustomerDonutRow[]
  formatTime: (seconds: number) => string
  tooltipStyle: CSSProperties
  onBarTypeClick: (typeId: number) => void
}

export function CustomerDashboardBarBlock({
  barChartData,
  tooltipStyle,
  onBarTypeClick,
}: Pick<Props, 'barChartData' | 'tooltipStyle' | 'onBarTypeClick'>) {
  return barChartData.length > 0 ? (
    <div className="customer-dash-recharts" style={{ height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={barChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis allowDecimals={false} />
          <RechartsTooltip contentStyle={tooltipStyle} />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            cursor={barChartData.some((d) => d.count > 0 && d.type_id != null) ? 'pointer' : 'default'}
            onClick={(barProps: { payload?: { type_id?: number | null; count?: number } }) => {
              const payload = barProps?.payload
              if (!payload || payload.count === 0 || payload.type_id == null) return
              onBarTypeClick(payload.type_id)
            }}
          >
            {barChartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Text type="secondary">No tickets yet</Text>
    </div>
  )
}

export function CustomerDashboardDonutBlock({
  donutData,
  formatTime,
  tooltipStyle,
}: Pick<Props, 'donutData' | 'formatTime' | 'tooltipStyle'>) {
  return donutData.length > 0 ? (
    <div className="customer-dash-recharts" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ width: 140, height: 140, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={65}
              paddingAngle={2}
              dataKey="value"
            >
              {donutData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Pie>
            <RechartsTooltip
              formatter={(v: number | undefined) => formatTime(v ?? 0)}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          flex: 1,
          background: 'var(--customer-dash-chart-legend-bg)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        {donutData.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: i < donutData.length - 1 ? '10px 0' : '0 0 0 0',
              borderBottom: i < donutData.length - 1 ? '1px solid var(--customer-dash-subtle-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: d.fill, flexShrink: 0 }} />
              <Text style={{ fontSize: 13 }}>{d.name}</Text>
            </div>
            <Text strong style={{ fontSize: 13 }}>
              {formatTime(d.value)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Text type="secondary">No time tracked yet</Text>
    </div>
  )
}
