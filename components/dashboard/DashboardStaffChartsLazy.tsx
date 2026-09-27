'use client'

import { Spin } from 'antd'
import dynamic from 'next/dynamic'

export default dynamic(() => import('./DashboardStaffCharts'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin />
    </div>
  ),
})
