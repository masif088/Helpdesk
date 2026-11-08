'use client'

import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, App, Button, Layout, Table, Tag, Typography } from 'antd'
import Link from 'next/link'
import { useState } from 'react'

import McpConnectorInfo from '@/components/common/McpConnectorInfo'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

const { Content } = Layout
const { Text, Paragraph, Title } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  baseUrl: string
  /** The SKILL.md text for the AI, with this portal's address filled in */
  skill: string
  /** Admins make keys under Settings and for others; everyone else makes their own under Profile */
  isAdmin?: boolean
}

const preStyle = { margin: 0, padding: 12, overflow: 'auto', fontSize: 12, background: 'var(--ant-color-fill-quaternary, #f5f5f5)', borderRadius: 6 } as const

function Code({ children }: { children: string }) {
  return <pre style={preStyle}>{children}</pre>
}

/** Settings -> API keys -> Tutorial: how to hand a key to someone, how they call it, and the skill file for their AI. */
export default function ApiKeysTutorialContent({ user, baseUrl, skill, isAdmin = true }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
    message.success('Copied')
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([skill], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'SKILL.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%', maxWidth: 900 }}>
          {isAdmin ? (
            <SettingsPageHeader title="API tutorial" description="Connect an AI to the tickets, step by step." />
          ) : (
            <div style={{ marginBottom: 16 }}>
              <Link href="/profile">← Profile</Link>
              <Title level={2} style={{ margin: '4px 0 0' }}>
                API tutorial
              </Title>
              <Text type="secondary">Connect your AI so it works with tickets as you, step by step.</Text>
            </div>
          )}

          <div style={{ display: 'grid', gap: 20 }}>
            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>1. Connect the assistant (no key)</Title>
              <McpConnectorInfo />
              <Alert type="info" showIcon message="Keys are not made by hand any more. The rest of this page is for keys that already exist, and for what the tools can do." />
            </section>

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>2. What it can do</Title>
              <Table
                size="small"
                pagination={false}
                rowKey="call"
                dataSource={[
                  { call: 'GET /api/tickets/lookup', scope: 'tickets:read', what: 'Types, teams and statuses (the ids to use when creating)' },
                  { call: 'GET /api/tickets?compact=1&assignee_ids=me&open=1', scope: 'tickets:read', what: 'List and search tickets. Filters: dates (created, updated, due), company, customer, person (assignee / requester), skill, type, status, tags, team, overdue, unassigned. See the API builder.' },
                  { call: 'GET /api/tickets/{id}/detail', scope: 'tickets:read', what: 'One ticket with its comments' },
                  { call: 'POST /api/tickets', scope: 'tickets:create', what: 'Create a ticket (title, description, type_id required for customers)' },
                  { call: 'POST /api/tickets/{id}/comments', scope: 'comments:create', what: 'Add a comment' },
                  { call: 'PATCH /api/tickets/{id}', scope: 'tickets:update', what: 'Change only the status, who is assigned and the due date (team keys only)' },
                  { call: 'GET /api/calendar/events?from=…&to=…', scope: 'calendar:read', what: 'Calendar: meetings, leave, holidays, events and due dates of a period' },
                  { call: 'GET /api/calendar/lookup', scope: 'calendar:read', what: 'Event types and what the key\'s user may create' },
                  { call: 'POST / PATCH / DELETE /api/calendar/events', scope: 'calendar:write', what: 'Add, change or delete an event (the team only)' },
                  { call: 'GET /api/users/activity?from=…&to=…', scope: 'team:read', what: 'Who worked in a period, time tracked, load and leave. Admins and managers only. Filters: person, skill, company, customer, ticket type' },
                ]}
                columns={[
                  { title: 'Call', dataIndex: 'call', render: (v: string) => <Text code>{v}</Text> },
                  { title: 'Scope', dataIndex: 'scope', render: (v: string) => <Tag>{v}</Tag>, width: 150 },
                  { title: 'What', dataIndex: 'what' },
                ]}
              />
              <Text type="secondary">
                No uploads, and no other change to tickets than status, assignees and due date; no delete. Everything else answers 403. Build any call, with the filters filled in for you, in the{' '}
                <Link href={isAdmin ? '/settings/api-keys/builder' : '/profile/api-builder'}>API builder</Link>.
              </Text>
            </section>

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>3. Try it (with a key that already exists)</Title>
              <Code>{`export KEY=tk_live_...

curl ${baseUrl}/api/tickets/lookup -H "Authorization: Bearer $KEY"

curl -X POST ${baseUrl}/api/tickets -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"title":"Printer is down","description":"<p>Floor 2</p>","type_id":1}'

curl -X POST ${baseUrl}/api/tickets/123/comments -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"comment":"<p>Still happening</p>"}'

curl ${baseUrl}/api/tickets/123/detail -H "Authorization: Bearer $KEY"

# my open tickets, short rows
curl "${baseUrl}/api/tickets?compact=1&assignee_ids=me&open=1" -H "Authorization: Bearer $KEY"

# what is on the calendar in November
curl "${baseUrl}/api/calendar/events?from=2026-11-01&to=2026-11-30" -H "Authorization: Bearer $KEY"`}</Code>
            </section>

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>4. Answers you can get</Title>
              <Table
                size="small"
                pagination={false}
                rowKey="code"
                dataSource={[
                  { code: '200', meaning: 'Done.' },
                  { code: '400', meaning: 'Something in the request is wrong; the error field says what (e.g. a type is required).' },
                  { code: '401', meaning: 'Key missing, wrong, revoked, expired, or without the scope for this call.' },
                  { code: '403', meaning: 'This endpoint is not available to keys, or the user behind the key may not do that (for example a client adding a calendar event).' },
                  { code: '404', meaning: 'Ticket does not exist or belongs to another company.' },
                  { code: '429', meaning: 'Hourly limit reached. The Retry-After header says in how many seconds.' },
                ]}
                columns={[
                  { title: 'Code', dataIndex: 'code', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                  { title: 'Meaning', dataIndex: 'meaning' },
                ]}
              />
            </section>

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>5. Marks you will see</Title>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Ticket: Source <Text code>API · Claude (Acme)</Text>, and <Text code>created_via = api</Text> (usable in automation rules).</li>
                <li>Comment: a blue tag with the same label, and a line in the ticket activity.</li>
                <li>The author is the user the key acts as; the label tells the AI apart from the person.</li>
              </ul>
            </section>

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>6. Skill for their AI</Title>
              <Paragraph style={{ margin: 0 }}>
                A ready instruction file that teaches an AI assistant this API: what to call, to look up the type first, to avoid duplicates, to ask before posting and to stop on 429. It already
                has this portal's address ({baseUrl}) and never contains the key: the AI reads the key from the environment variable <Text code>TICKETING_API_KEY</Text>. The same text is always
                current at <a href="/api/skill" target="_blank" rel="noreferrer">{baseUrl}/api/skill</a>, so you can also just tell the AI to read that address.
              </Paragraph>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="primary" icon={<DownloadOutlined />} onClick={download}>
                  Download SKILL.md
                </Button>
                <Button icon={<CopyOutlined />} onClick={() => copy(skill)}>
                  Copy text
                </Button>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Claude: put it in a folder <Text code>ticketing-api/SKILL.md</Text> under the skills directory (or upload it as a skill). Another AI: paste the text into its system prompt or
                project instructions and give it the key as <Text code>TICKETING_API_KEY</Text>.
              </Text>
              <pre style={{ ...preStyle, maxHeight: 360 }}>{skill}</pre>
            </section>
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
