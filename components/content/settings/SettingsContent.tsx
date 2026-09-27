'use client'

import { ApartmentOutlined, ApiOutlined, AppstoreOutlined, ArrowRightOutlined, BgColorsOutlined, CarryOutOutlined, FieldTimeOutlined, IdcardOutlined, MailOutlined, MessageOutlined, PushpinOutlined, ReadOutlined, RobotOutlined, ScheduleOutlined, SearchOutlined, SlackOutlined, SoundOutlined, SyncOutlined, TagsOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Input, Layout, Typography } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { canAccessAiSettings, canAccessAutomationRules, canAccessChecklistTemplates, canAccessEmailIntegration, canAccessKnowledgeBase, canAccessMessageTemplates, canAccessRecurringTickets, canAccessSlackNotifications, canAccessTeams, canAccessTicketAttributes, canAccessUsers, canManageDashboardAnnouncements, canManageGlobalAnnouncement, isAdmin } from '@/lib/auth-utils'

const { Content } = Layout
const { Title, Text } = Typography

type SettingItem = {
  title: string
  description: string
  href: string
  icon: ReactNode
  /** Extra search words */
  keywords?: string
  show: (role: string) => boolean
}

type SettingGroup = {
  key: string
  title: string
  description: string
  icon: ReactNode
  /** Accent color of the group (icon chips) */
  tone: string
  items: SettingItem[]
}


const GROUPS: SettingGroup[] = [
  {
    key: 'tickets',
    title: 'Tickets',
    description: 'How tickets are classified and worked on',
    icon: <AppstoreOutlined />,
    tone: '#0F9D8A',
    items: [
      { title: 'Statuses', description: 'Workflow states and Kanban columns', href: '/settings/ticket-statuses', icon: <ApartmentOutlined />, keywords: 'workflow kanban column', show: canAccessTicketAttributes },
      { title: 'Types', description: 'Request categories: bug, feature, question…', href: '/settings/ticket-types', icon: <AppstoreOutlined />, keywords: 'category', show: canAccessTicketAttributes },
      { title: 'Tags', description: 'Labels for organizing and filtering tickets', href: '/settings/tags', icon: <TagsOutlined />, keywords: 'label', show: canAccessTicketAttributes },
      { title: 'Checklist templates', description: 'Reusable checklists, grouped, applied to tickets', href: '/settings/checklist-templates', icon: <CarryOutOutlined />, keywords: 'todo task', show: canAccessChecklistTemplates },
      { title: 'Job types', description: 'Work categories for the time tracker, billable or not', href: '/settings/job-types-catalog', icon: <FieldTimeOutlined />, keywords: 'time tracker billable hours', show: isAdmin },
    ],
  },
  {
    key: 'workflow',
    title: 'Workflow & automation',
    description: 'Things that happen on their own',
    icon: <ThunderboltOutlined />,
    tone: '#D97706',
    items: [
      { title: 'Automation rules', description: 'When a ticket matches, set fields, tags, notes…', href: '/settings/automation-rules', icon: <ThunderboltOutlined />, keywords: 'trigger action time', show: canAccessAutomationRules },
      { title: 'Recurring tickets', description: 'Create tickets automatically on a schedule', href: '/settings/recurring-tickets', icon: <SyncOutlined />, keywords: 'schedule repeat', show: canAccessRecurringTickets },
      { title: 'Message templates', description: 'Email notifications and reply templates', href: '/settings/message-templates', icon: <MessageOutlined />, keywords: 'email reply notification', show: canAccessMessageTemplates },
    ],
  },
  {
    key: 'integrations',
    title: 'Integrations',
    description: 'Connected services',
    icon: <ApiOutlined />,
    tone: '#6366F1',
    items: [
      { title: 'Email (Gmail)', description: 'Mailbox that turns emails into tickets and sends replies', href: '/settings/email-integration', icon: <MailOutlined />, keywords: 'gmail inbox sync', show: canAccessEmailIntegration },
      { title: 'Slack', description: 'Ticket alerts to Slack channels', href: '/settings/slack-notifications', icon: <SlackOutlined />, keywords: 'notification channel', show: canAccessSlackNotifications },
      { title: 'AI', description: 'Provider and model for summaries and reply drafts', href: '/settings/ai', icon: <RobotOutlined />, keywords: 'openai codex summary', show: canAccessAiSettings },
    ],
  },
  {
    key: 'people',
    title: 'People & access',
    description: 'Internal accounts and teams',
    icon: <TeamOutlined />,
    tone: '#0EA5E9',
    items: [
      { title: 'Users', description: 'Admins, managers and staff accounts', href: '/settings/users', icon: <IdcardOutlined />, keywords: 'staff admin manager account', show: canAccessUsers },
      { title: 'Teams', description: 'Groups that tickets are assigned to', href: '/settings/teams', icon: <TeamOutlined />, keywords: 'group member', show: canAccessTeams },
    ],
  },
  {
    key: 'content',
    title: 'Content & announcements',
    description: 'What customers and staff read',
    icon: <ReadOutlined />,
    tone: '#E11D48',
    items: [
      { title: 'Knowledge base', description: 'Help articles for customers', href: '/settings/knowledge-base', icon: <ReadOutlined />, keywords: 'article help faq', show: canAccessKnowledgeBase },
      { title: 'Global announcement', description: 'Banner across the app, with start and end time', href: '/settings/global-announcement', icon: <SoundOutlined />, keywords: 'banner', show: canManageGlobalAnnouncement },
      { title: 'Dashboard announcements', description: 'Posts on the dashboard, per role', href: '/settings/dashboard-announcements', icon: <PushpinOutlined />, keywords: 'news post', show: canManageDashboardAnnouncements },
    ],
  },
  {
    key: 'system',
    title: 'System',
    description: 'Look, health and background jobs',
    icon: <ScheduleOutlined />,
    tone: '#64748B',
    items: [
      { title: 'Branding', description: 'App name, logo, favicon and email sender name', href: '/settings/app-branding', icon: <BgColorsOutlined />, keywords: 'logo name favicon sender', show: isAdmin },
      { title: 'Scheduled jobs', description: 'Email sync, recurring tickets, time triggers: last run and setup', href: '/settings/scheduled-jobs', icon: <ScheduleOutlined />, keywords: 'cron apps script scheduler sync', show: isAdmin },
      { title: 'Connection status', description: 'Database, storage, Firebase, email and AI checks', href: '/settings/connection-status', icon: <ApiOutlined />, keywords: 'health check firebase storage', show: isAdmin },
    ],
  },
]

function SettingCard({ item, tone }: { item: SettingItem; tone: string }) {
  return (
    <SpaNavLink href={item.href} className="settings-card" style={{ ['--tone' as string]: tone } as CSSProperties}>
      <span className="settings-card__icon">{item.icon}</span>
      <span className="settings-card__text">
        <span className="settings-card__title">{item.title}</span>
        <span className="settings-card__desc">{item.description}</span>
      </span>
      <ArrowRightOutlined className="settings-card__arrow" />
    </SpaNavLink>
  )
}

interface SettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function SettingsContent({ user: currentUser }: SettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const role = (currentUser.role ?? '').toLowerCase()

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.show(role) &&
          (!q || `${it.title} ${it.description} ${it.keywords ?? ''} ${g.title}`.toLowerCase().includes(q))
      ),
    })).filter((g) => g.items.length > 0)
  }, [role, query])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...currentUser, role: currentUser.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Settings
              </Title>
              <Text className="page-head__sub">Ticket catalog, automation, integrations and system options</Text>
            </div>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search settings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 280, maxWidth: '100%' }}
            />
          </div>

          {groups.length === 0 ? (
            <div className="settings-empty">No settings match “{query}”.</div>
          ) : (
            <div className="settings-groups">
              {groups.map((g) => (
                <section key={g.key} className="settings-group" style={{ ['--tone' as string]: g.tone } as CSSProperties}>
                  <header className="settings-group__head">
                    <span className="settings-group__icon">{g.icon}</span>
                    <span>
                      <span className="settings-group__title">{g.title}</span>
                      <span className="settings-group__desc">{g.description}</span>
                    </span>
                  </header>
                  <div className="settings-group__items">
                    {g.items.map((it) => (
                      <SettingCard key={it.href} item={it} tone={g.tone} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
