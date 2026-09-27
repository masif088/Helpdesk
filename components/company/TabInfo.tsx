'use client'

import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Col, Row, Space, Tag, Typography } from 'antd'

import DateDisplay from '@/components/common/DateDisplay'

import TabCompanyAttributes from './TabCompanyAttributes'

const { Text } = Typography

interface TabInfoProps {
  companyData: any
  canEdit?: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="info-field">
      <div className="info-field__label">{label}</div>
      <div className="info-field__value">{children}</div>
    </div>
  )
}

export default function TabInfo({ companyData, canEdit = false }: TabInfoProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <section className="ticket-surface billing-section">
          <header className="billing-section__head">
            <span>Details</span>
          </header>
          <div className="info-grid">
            <Field label="Email">
              {companyData.email ? <a href={`mailto:${companyData.email}`}>{companyData.email}</a> : <Text type="secondary">—</Text>}
            </Field>
            <Field label="Status">
              {companyData.is_active ? (
                <Tag color="green" icon={<CheckCircleOutlined />}>Active</Tag>
              ) : (
                <Tag icon={<CloseCircleOutlined />}>Inactive</Tag>
              )}
            </Field>
            <Field label="Active team">{companyData.active_team_name || <Text type="secondary">—</Text>}</Field>
            <Field label="Active manager">{companyData.active_manager_display || <Text type="secondary">—</Text>}</Field>
            <Field label="Brand color">
              <Space>
                <span className="info-swatch" style={{ backgroundColor: companyData.color || '#000000' }} />
                <Text code>{companyData.color || '#000000'}</Text>
              </Space>
            </Field>
            <Field label="Created">
              <Space size={6}>
                <CalendarOutlined />
                <DateDisplay date={companyData.created_at} format="detailed" />
              </Space>
            </Field>
            <Field label="Last updated">
              <Space size={6}>
                <ClockCircleOutlined />
                <DateDisplay date={companyData.updated_at} format="detailed" />
              </Space>
            </Field>
            <Field label="Company ID">
              <Text code copyable style={{ fontSize: 12 }}>
                {companyData.id}
              </Text>
            </Field>
          </div>
        </section>
      </Col>
      <Col xs={24} xl={14}>
        <section className="ticket-surface billing-section">
          <header className="billing-section__head">
            <span>Custom information</span>
          </header>
          <div style={{ padding: '4px 16px 16px' }}>
            <TabCompanyAttributes companyId={companyData.id} canEdit={canEdit} />
          </div>
        </section>
      </Col>
    </Row>
  )
}
