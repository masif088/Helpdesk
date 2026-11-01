'use client'

import { CopyOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Alert, App, Button, DatePicker, Input, Layout, Popconfirm, Select, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { API_ENDPOINTS, type ApiEndpoint, type ApiParam, buildRequest, curlCommand, endpointById, requestUrl } from '@/lib/api-catalog'

const { Content } = Layout
const { Text, Title } = Typography

type Option = { value: string; label: string }
type Choices = { people: Option[]; companies: Option[]; types: Option[]; statuses: Option[]; teams: Option[]; tags: Option[]; skills: Option[] }
type Picker = { kind: keyof Choices; multi: boolean; me?: boolean }

/** Parameters that are ids: the builder offers a list to pick from instead of asking you to know the id. */
const PICKERS: Record<string, Picker> = {
  assignee_ids: { kind: 'people', multi: true, me: true },
  creator_ids: { kind: 'people', multi: true, me: true },
  user_ids: { kind: 'people', multi: true, me: true },
  customer_ids: { kind: 'people', multi: true },
  attendee_ids: { kind: 'people', multi: true },
  owner_id: { kind: 'people', multi: false },
  company_ids: { kind: 'companies', multi: true },
  company_id: { kind: 'companies', multi: false },
  type_ids: { kind: 'types', multi: true },
  status: { kind: 'statuses', multi: true },
  team_ids: { kind: 'teams', multi: true },
  tag_ids: { kind: 'tags', multi: true },
  skills: { kind: 'skills', multi: true },
  agent_skills: { kind: 'skills', multi: true },
}

const METHOD_COLOR: Record<string, string> = { GET: 'blue', POST: 'green', PATCH: 'orange', DELETE: 'red' }
const preStyle = { margin: 0, padding: 12, overflow: 'auto', fontSize: 12, background: 'var(--ant-color-fill-quaternary, #f5f5f5)', borderRadius: 6 } as const

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  baseUrl: string
  isAdmin: boolean
}

export default function ApiBuilderContent({ user, baseUrl, isAdmin }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [endpointId, setEndpointId] = useState('tickets.list')
  const [values, setValues] = useState<Record<string, string>>({ compact: '1' })
  const [choices, setChoices] = useState<Choices>({ people: [], companies: [], types: [], statuses: [], teams: [], tags: [], skills: [] })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ status: number; ms: number; text: string } | null>(null)

  const endpoint = endpointById(endpointId) as ApiEndpoint
  const isStaff = (user.role ?? '').toLowerCase() !== 'customer'

  useEffect(() => {
    fetch('/api/tickets/lookup', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setChoices((c) => ({
          ...c,
          people: (d.users ?? []).map((u: { id: string; full_name: string | null; email: string }) => ({ value: u.id, label: u.full_name || u.email })),
          companies: (d.companies ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })),
          types: (d.ticketTypes ?? []).map((x: { id: number; title: string }) => ({ value: String(x.id), label: x.title })),
          statuses: (d.statuses ?? []).map((x: { slug: string; title: string }) => ({ value: x.slug, label: x.title })),
          teams: (d.teams ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })),
          tags: (d.tags ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })),
        }))
      })
      .catch(() => {})
    if (isStaff) {
      fetch('/api/users/skills', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : []))
        .then((d: { skill: string }[]) => setChoices((c) => ({ ...c, skills: (Array.isArray(d) ? d : []).map((s) => ({ value: s.skill, label: s.skill })) })))
        .catch(() => {})
    }
  }, [isStaff])

  const request = useMemo(() => buildRequest(endpoint, values), [endpoint, values])
  const url = requestUrl(baseUrl, request)
  const curl = curlCommand(baseUrl, request)
  const write = endpoint.method !== 'GET'
  const set = (name: string, v: string) => setValues((cur) => ({ ...cur, [name]: v }))

  const pick = (id: string) => {
    setEndpointId(id)
    setResult(null)
    setValues(id === 'tickets.list' ? { compact: '1' } : {})
  }

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
    message.success('Copied')
  }

  const run = async () => {
    if (request.missing.length) return message.warning(`Fill in: ${request.missing.join(', ')}`)
    setRunning(true)
    setResult(null)
    const started = performance.now()
    try {
      const res = await fetch(`${request.path}${request.query ? `?${request.query}` : ''}`, {
        method: request.method,
        credentials: 'include',
        headers: request.body ? { 'Content-Type': 'application/json' } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
      })
      const raw = await res.text()
      let text = raw
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        /* not JSON: show as is */
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - started), text: text.length > 60_000 ? `${text.slice(0, 60_000)}\n… (cut: ${text.length} characters in all)` : text })
    } catch (e) {
      setResult({ status: 0, ms: Math.round(performance.now() - started), text: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  const field = (p: ApiParam) => {
    const value = values[p.name] ?? ''
    const picker = PICKERS[p.name]
    if (picker) {
      const options = [...(picker.me ? [{ value: 'me', label: 'Me (the key\'s user)' }] : []), ...choices[picker.kind]]
      return (
        <Select
          mode={picker.multi ? (picker.kind === 'skills' ? 'tags' : 'multiple') : undefined}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={p.example ? `e.g. ${p.example}` : 'Any'}
          value={picker.multi ? (value ? value.split(',') : []) : value || undefined}
          onChange={(v) => set(p.name, Array.isArray(v) ? v.join(',') : (v ?? ''))}
          options={options}
          style={{ width: '100%' }}
        />
      )
    }
    if (p.type === 'enum') return <Select allowClear placeholder="Any" value={value || undefined} onChange={(v) => set(p.name, v ?? '')} options={(p.options ?? []).map((o) => ({ value: o, label: o }))} style={{ width: '100%' }} />
    if (p.type === 'boolean') return <Select allowClear placeholder="Not set" value={value || undefined} onChange={(v) => set(p.name, v ?? '')} options={[{ value: '1', label: 'Yes (1)' }, { value: '0', label: 'No (0)' }]} style={{ width: '100%' }} />
    if (p.type === 'date') return <DatePicker style={{ width: '100%' }} value={value ? dayjs(value) : null} onChange={(d) => set(p.name, d ? d.format('YYYY-MM-DD') : '')} />
    if (p.type === 'html') return <Input.TextArea rows={3} value={value} placeholder={p.example} onChange={(e) => set(p.name, e.target.value)} />
    return <Input value={value} placeholder={p.example ? `e.g. ${p.example}` : p.type === 'list' ? 'comma separated' : undefined} onChange={(e) => set(p.name, e.target.value)} allowClear />
  }

  const grouped = (['Tickets', 'Calendar', 'Team'] as const).map((g) => ({ label: g, options: API_ENDPOINTS.filter((e) => e.group === g).map((e) => ({ value: e.id, label: `${e.method}  ${e.path}` })) }))
  const sections: { title: string; where: ApiParam['where'] }[] = [
    { title: 'Path', where: 'path' },
    { title: 'Filters and options', where: 'query' },
    { title: 'Body', where: 'body' },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%', maxWidth: 1100 }}>
          {isAdmin ? (
            <SettingsPageHeader title="API builder" description="Build a call, copy it as a URL or curl, and try it with your own login." />
          ) : (
            <div style={{ marginBottom: 16 }}>
              <Link href="/profile">← Profile</Link>
              <Title level={2} style={{ margin: '4px 0 0' }}>
                API builder
              </Title>
              <Text type="secondary">Build a call, copy it as a URL or curl, and try it with your own login.</Text>
            </div>
          )}

          <div style={{ display: 'grid', gap: 16 }}>
            <Alert
              type="info"
              showIcon
              message="Same rules as a key"
              description={
                <>
                  Trying a call here runs it as you, so you see exactly what a key made for you would. Calls that add, change or delete really do. The curl command reads your key from
                  <code> $TICKETING_API_KEY</code>, never with the key in it. For the AI, give it <a href="/api/skill" target="_blank" rel="noreferrer">the skill file</a> (also under the <Link href={isAdmin ? '/settings/api-keys/tutorial' : '/profile/api-tutorial'}>tutorial</Link>).
                </>
              }
            />

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Select value={endpointId} onChange={pick} options={grouped} style={{ minWidth: 320 }} showSearch optionFilterProp="label" />
                <Tag color={METHOD_COLOR[endpoint.method]} style={{ margin: 0 }}>
                  {endpoint.method}
                </Tag>
                <Text code>{endpoint.path}</Text>
                <Tag style={{ margin: 0 }}>key permission: {endpoint.scope}</Tag>
              </div>
              <Text type="secondary">{endpoint.summary}</Text>
              {endpoint.params.length === 0 ? <Text type="secondary">No parameters.</Text> : null}
              {sections.map((s) => {
                const params = endpoint.params.filter((p) => p.where === s.where && (isStaff || !p.staffOnly))
                if (!params.length) return null
                return (
                  <div key={s.where} style={{ display: 'grid', gap: 10 }}>
                    <Text strong>{s.title}</Text>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {params.map((p) => (
                        <div key={p.name} style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                          <span>
                            <code>{p.name}</code>
                            {p.required ? <span style={{ color: '#DC2626' }}> *</span> : null}
                            {p.staffOnly ? <Tag style={{ marginLeft: 6 }}>staff</Tag> : null}
                          </span>
                          {field(p)}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {p.description}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <Text strong>Your call</Text>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Tag color={METHOD_COLOR[endpoint.method]} style={{ margin: 0 }}>
                  {endpoint.method}
                </Tag>
                <Text code style={{ wordBreak: 'break-all' }}>
                  {url}
                </Text>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copy(url)}>
                  Copy URL
                </Button>
              </div>
              {request.body ? <pre style={preStyle}>{JSON.stringify(request.body, null, 2)}</pre> : null}
              <div style={{ position: 'relative' }}>
                <pre style={preStyle}>{curl}</pre>
                <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => copy(curl)}>
                  Copy curl
                </Button>
              </div>
              {request.missing.length ? <Alert type="warning" showIcon message={`Still needed: ${request.missing.join(', ')}`} /> : null}
              <Space>
                {write ? (
                  <Popconfirm title="This really changes data" description="Run it as you?" okText="Run" okButtonProps={{ danger: endpoint.method === 'DELETE' }} onConfirm={() => void run()}>
                    <Button type="primary" danger={endpoint.method === 'DELETE'} icon={<PlayCircleOutlined />} loading={running}>
                      Run it
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => void run()}>
                    Run it
                  </Button>
                )}
                {result ? (
                  <Text type="secondary">
                    <Tag color={result.status >= 200 && result.status < 300 ? 'green' : 'red'}>{result.status || 'failed'}</Tag>
                    {result.ms} ms
                  </Text>
                ) : null}
              </Space>
              {result ? <pre style={{ ...preStyle, maxHeight: 420 }}>{result.text}</pre> : null}
            </section>
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
