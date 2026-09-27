'use client'

import {
  AppstoreOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  MailOutlined,
  NotificationOutlined,
  RobotOutlined,
  SettingOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Col, Layout, Row, Typography } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import {
  canAccessAiSettings,
  canAccessAutomationRules,
  canAccessChecklistTemplates,
  canAccessEmailIntegration,
  canAccessKnowledgeBase,
  canAccessMessageTemplates,
  canAccessRecurringTickets,
  canAccessSlackNotifications,
  canAccessTeams,
  canAccessTicketAttributes,
  canAccessUsers,
  canManageDashboardAnnouncements,
  canManageGlobalAnnouncement,
  isAdmin,
} from '@/lib/auth-utils'

const { Content } = Layout
const { Title, Text } = Typography

const tileStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  padding: 20,
  gap: 20,
  alignItems: 'center',
  borderRadius: 12,
  background: 'var(--settings-hub-tile-bg)',
  border: '1px solid var(--settings-hub-tile-border)',
  transition: 'background 0.2s, box-shadow 0.2s',
}

interface HubTileProps {
  title: string
  description?: string
  href: string
  icon: ReactNode
}

function HubTile({ title, description, href, icon }: HubTileProps) {
  return (
    <SpaNavLink
      href={href}
      style={{ display: 'block', height: '100%', color: 'inherit' }}
      className="settings-hub-tile-link"
    >
      <div
        className="settings-hub-tile"
        style={tileStyle}
      >
        <div style={{ fontSize: 22, color: '#1890ff', marginBottom: 12 }}>{icon}</div>
        <div>
        <Text strong style={{ fontSize: 15, display: 'block', color: 'var(--settings-hub-tile-title)' }}>
          {title}
        </Text>
        {description ? (
          <Text style={{ fontSize: 13, display: 'block', color: 'var(--settings-hub-tile-desc)' }}>
            {description}
          </Text>
        ) : null}
        </div>
        
      </div>
    </SpaNavLink>
  )
}

interface SectionProps {
  heading: string
  children: ReactNode
}

function Section({ heading, children }: SectionProps) {
  return (
    <section style={{ marginBottom: 32 }}>
      <Title level={4} className="settings-section-heading" style={{ marginTop: 0, marginBottom: 16 }}>
        {heading}
      </Title>
      {children}
    </section>
  )
}

interface SettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function SettingsContent({ user: currentUser }: SettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const role = (currentUser.role ?? '').toLowerCase()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{
          ...currentUser,
          role: currentUser.role ?? undefined,
        }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={2} className="settings-section-heading" style={{ margin: 0 }}>
              Settings
            </Title>
            <Text style={{ color: 'var(--settings-hub-tile-desc)' }}>
              Configure ticket catalogs, automation, and general options
            </Text>
          </div>

          {/* ── Ticket Attributes ─────────────────────────────────── */}
          {canAccessTicketAttributes(role) && (
            <Section heading="Ticket Attributes">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Statuses"
                    description="Workflow states and kanban columns"
                    href="/settings/ticket-statuses"
                    icon={<SettingOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Types"
                    description="Request categories (bug, feature, etc)"
                    href="/settings/ticket-types"
                    icon={<AppstoreOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Tags"
                    description="Labels for organizing tickets"
                    href="/settings/tags"
                    icon={<TagOutlined />}
                  />
                </Col>
                {isAdmin(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Job Types"
                      description="Work categories for the time tracker"
                      href="/settings/job-types-catalog"
                      icon={<ToolOutlined />}
                    />
                  </Col>
                )}
                {canAccessChecklistTemplates(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Checklist Templates"
                      description="Reusable checklist templates with groups, applied to tickets"
                      href="/settings/checklist-templates"
                      icon={<CheckSquareOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

          {/* ── Automation & Notifications ────────────────────────── */}
          {(canAccessEmailIntegration(role) ||
            canAccessSlackNotifications(role) ||
            canAccessMessageTemplates(role) ||
            canAccessAutomationRules(role) ||
            canAccessRecurringTickets(role)) && (
            <Section heading="Automation & Notifications">
              <Row gutter={[16, 16]}>
                {canAccessEmailIntegration(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Email Integration"
                      description="Inbound mail and threading"
                      href="/settings/email-integration"
                      icon={<MailOutlined />}
                    />
                  </Col>
                )}
                {canAccessSlackNotifications(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Slack Notifications"
                      description="Ticket alerts to a Slack channel"
                      href="/settings/slack-notifications"
                      icon={<BellOutlined />}
                    />
                  </Col>
                )}
                {canAccessMessageTemplates(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Message Templates"
                      description="Notification and reply templates"
                      href="/settings/message-templates"
                      icon={<FileTextOutlined />}
                    />
                  </Col>
                )}
                {canAccessAutomationRules(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Automation Rules"
                      description="Triggers and actions on tickets"
                      href="/settings/automation-rules"
                      icon={<ThunderboltOutlined />}
                    />
                  </Col>
                )}
                {canAccessRecurringTickets(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Recurring Tickets"
                      description="Auto-create tickets on a schedule"
                      href="/settings/recurring-tickets"
                      icon={<CalendarOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

          {/* ── People & Access ───────────────────────────────────── */}
          {(canAccessUsers(role) || canAccessTeams(role)) && (
            <Section heading="People & Access">
              <Row gutter={[16, 16]}>
                {canAccessUsers(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Users"
                      description="Internal accounts: admins, managers and staff"
                      href="/settings/users"
                      icon={<UserOutlined />}
                    />
                  </Col>
                )}
                {canAccessTeams(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Teams"
                      description="Groups for ticket assignments"
                      href="/settings/teams"
                      icon={<TeamOutlined />}
                    />
                  </Col>
                )}
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Feature Access"
                    description="Role-based access overview for all features"
                    href="/settings/feature-access"
                    icon={<UnorderedListOutlined />}
                  />
                </Col>
                {isAdmin(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Connection Status"
                      description="Check database, storage, Firebase, email, and AI connectivity"
                      href="/settings/connection-status"
                      icon={<ToolOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}


          {/* ── Content ───────────────────────────────────────────── */}
          {(canAccessKnowledgeBase(role) ||
            canManageGlobalAnnouncement(role) ||
            canManageDashboardAnnouncements(role)) && (
            <Section heading="Content">
              <Row gutter={[16, 16]}>
                {canAccessKnowledgeBase(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Knowledge Base"
                      description="Help articles for customers"
                      href="/settings/knowledge-base"
                      icon={<InfoCircleOutlined />}
                    />
                  </Col>
                )}
                {canManageGlobalAnnouncement(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Global Announcement"
                      description="Running banner with start and end schedule"
                      href="/settings/global-announcement"
                      icon={<NotificationOutlined />}
                    />
                  </Col>
                )}
                {canManageDashboardAnnouncements(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Dashboard Announcements"
                      description="Title on dashboard, full text in a modal; by role"
                      href="/settings/dashboard-announcements"
                      icon={<BellOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

          {/* ── App ───────────────────────────────────────────────── */}
          {isAdmin(role) && (
            <Section heading="App">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="App Branding"
                    description="App name, logo, and favicon"
                    href="/settings/app-branding"
                    icon={<GlobalOutlined />}
                  />
                </Col>
                {canAccessAiSettings(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="AI Integration"
                      description="Codex/OpenAI provider and active model"
                      href="/settings/ai"
                      icon={<RobotOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
