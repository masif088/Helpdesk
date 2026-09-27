'use client'

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Button,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'

const { Text } = Typography
const { RangePicker } = DatePicker

function disabledDateNotAfterToday(current: Dayjs) {
  return !!current && current.isAfter(dayjs(), 'day')
}

function getDisabledTimeNotAfterNow(date: Dayjs | null | undefined) {
  const now = dayjs()
  if (!date || !date.isSame(now, 'day')) {
    return {}
  }
  return {
    disabledHours: () => {
      const h: number[] = []
      for (let i = now.hour() + 1; i < 24; i++) h.push(i)
      return h
    },
    disabledMinutes: (selectedHour: number) => {
      if (selectedHour < now.hour()) return []
      if (selectedHour > now.hour()) return Array.from({ length: 60 }, (_, i) => i)
      const m: number[] = []
      for (let i = now.minute() + 1; i < 60; i++) m.push(i)
      return m
    },
    disabledSeconds: (selectedHour: number, selectedMinute: number) => {
      if (selectedHour !== now.hour() || selectedMinute !== now.minute()) return []
      const s: number[] = []
      for (let i = now.second() + 1; i < 60; i++) s.push(i)
      return s
    },
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || res.statusText || 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export type TimeTrackerManualUserOption = { value: string; label: string }

export interface TabTimeTrackerProps {
  ticketData: { id: number }
  totalTimeSeconds: number
  activeTimeTracker: unknown
  formatTime: (seconds: number) => string
  timeTrackerSessions: unknown[]
  timeTrackerLoading?: boolean
  onStartTimeTracker: (jobType?: string | null) => void | Promise<void>
  onStopTimeTracker: () => void
  currentUserId: string
  onTimeTrackingChanged: () => Promise<void>
  /** Admin: edit/delete/add manual for any user on this ticket */
  canManageOthersTime?: boolean
  manualUserOptions?: TimeTrackerManualUserOption[]
  /** Admin/manager: override reported duration (billing) without changing tracked time */
  canAdjustReportedDuration?: boolean
  /** Admin only: edit start/stop window in Adjust tracker */
  canAdjustStartStop?: boolean
  /** Admin/manager: add manual time entries */
  canAddManual?: boolean
}

export default function TabTimeTracker({
  ticketData,
  totalTimeSeconds,
  activeTimeTracker,
  formatTime,
  timeTrackerSessions,
  timeTrackerLoading = false,
  onStartTimeTracker,
  onStopTimeTracker,
  currentUserId,
  onTimeTrackingChanged,
  canManageOthersTime = false,
  manualUserOptions = [],
  canAdjustReportedDuration = false,
  canAdjustStartStop = false,
  canAddManual = false,
}: TabTimeTrackerProps) {
  const ticketId = ticketData?.id as number
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const tracker = activeTimeTracker as { start_time: string } | null | undefined
    if (!tracker) { setElapsed(0); return }
    const calc = () => Math.floor((Date.now() - new Date(tracker.start_time).getTime()) / 1000)
    setElapsed(calc())
    const id = window.setInterval(() => setElapsed(calc()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimeTracker])

  const [paused, setPaused] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [adjustTrackerOpen, setAdjustTrackerOpen] = useState(false)
  const [adjustTrackerSession, setAdjustTrackerSession] = useState<Record<string, unknown> | null>(null)
  const [mutating, setMutating] = useState(false)
  const [manualForm] = Form.useForm()
  const [adjustTrackerForm] = Form.useForm()

  type JobTypeOpt = { slug: string; title: string; billable?: boolean }
  const jobTypeSelectOptions = (opts: JobTypeOpt[]) =>
    opts.map((o) => ({ value: o.slug, label: o.billable === false ? `${o.title} (non-billable)` : o.title }))
  const [jobTypeOptions, setJobTypeOptions] = useState<JobTypeOpt[]>([])
  const [timerJobType, setTimerJobType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await apiFetch<JobTypeOpt[]>('/api/job-types')
        if (cancelled) return
        setJobTypeOptions(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setJobTypeOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isOwner = (session: Record<string, unknown>) =>
    String(
      session.userId ?? session.user_id ?? (session.user as { id?: string } | undefined)?.id ?? ''
    ) === String(currentUserId)

  const openManual = () => {
    manualForm.resetFields()
    const base: Record<string, unknown> = {
      hours: 0,
      minutes: 30,
      seconds: 0,
      startedAt: dayjs(),
    }
    if (canManageOthersTime) {
      base.forUserId = currentUserId
    }
    if (timerJobType) base.job_type = timerJobType
    manualForm.setFieldsValue(base)
    setManualOpen(true)
  }

  const submitManual = async () => {
    const v = await manualForm.validateFields()
    const hours = Number(v.hours) || 0
    const minutes = Number(v.minutes) || 0
    const secs = Number(v.seconds) || 0
    const durationSeconds = hours * 3600 + minutes * 60 + secs
    if (durationSeconds < 1) {
      message.error('Set duration to at least 1 second')
      throw new Error('duration')
    }
    const startedAt: Dayjs = v.startedAt
    if (!startedAt || !startedAt.isValid()) {
      message.error('Invalid date')
      throw new Error('date')
    }
    if (startedAt.isAfter(dayjs())) {
      message.error('Worked start cannot be in the future')
      throw new Error('future')
    }
    const workEnd = startedAt.add(durationSeconds, 'second')
    if (workEnd.isAfter(dayjs())) {
      message.error('Total duration would end in the future — reduce duration or pick an earlier start')
      throw new Error('endfuture')
    }
    setMutating(true)
    try {
      const payload: Record<string, unknown> = {
        action: 'manual',
        duration_seconds: durationSeconds,
        started_at: startedAt.toISOString(),
      }
      if (canManageOthersTime && v.forUserId) {
        payload.user_id = v.forUserId
      }
      if (v.job_type != null && String(v.job_type).trim() !== '') {
        payload.job_type = String(v.job_type).trim()
      }
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      message.success('Manual time added')
      setManualOpen(false)
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to add time')
      throw e
    } finally {
      setMutating(false)
    }
  }

  const reportedSecondsFromSession = (session: Record<string, unknown>) => {
    if (
      session.reported_duration_seconds != null &&
      Number.isFinite(Number(session.reported_duration_seconds))
    ) {
      return Number(session.reported_duration_seconds)
    }
    if (session.duration_adjustment != null && Number.isFinite(Number(session.duration_adjustment))) {
      return Number(session.duration_adjustment)
    }
    return Number(session.duration_seconds) || 0
  }

  const openAdjustTracker = (session: Record<string, unknown>) => {
    setAdjustTrackerSession(session)
    const rep = reportedSecondsFromSession(session)
    adjustTrackerForm.setFieldsValue({
      range: [dayjs(session.start_time as string), dayjs(session.stop_time as string)],
      job_type: (session.job_type as string | null | undefined) ?? undefined,
      note: (session.note as string | null | undefined) ?? '',
      reportedMinutes: Math.round((Math.max(0, rep) / 60) * 100) / 100,
    })
    setAdjustTrackerOpen(true)
  }

  const submitAdjustTracker = async () => {
    if (!adjustTrackerSession) return
    const v = await adjustTrackerForm.validateFields()
    const [start, end] = v.range as [Dayjs, Dayjs]
    if (!start || !end || !end.isAfter(start)) {
      message.error('End must be after start')
      throw new Error('range')
    }
    const now = dayjs()
    if (start.isAfter(now) || end.isAfter(now)) {
      message.error('Start and stop cannot be in the future (max: today, until now)')
      throw new Error('future')
    }

    const origStart = dayjs(adjustTrackerSession.start_time as string)
    const origStop = dayjs(adjustTrackerSession.stop_time as string)
    const timesChanged = !start.isSame(origStart, 'second') || !end.isSame(origStop, 'second')

    const newJobType = String(v.job_type ?? '').trim()
    const origJobType = (adjustTrackerSession.job_type as string | null | undefined) ?? null
    const jobTypeChanged = newJobType !== origJobType

    const newNote = String(v.note ?? '').trim()
    const origNote =
      (adjustTrackerSession.note as string | null | undefined)?.trim() || null
    const noteChanged = newNote !== origNote

    const origReported = reportedSecondsFromSession(adjustTrackerSession)
    const newReportedSecs = canAdjustReportedDuration
      ? Math.min(2147483647, Math.round(Math.max(0, Number(v.reportedMinutes) || 0) * 60))
      : origReported
    const reportedChanged = canAdjustReportedDuration && newReportedSecs !== origReported

    const needsEntryPatch = timesChanged || jobTypeChanged || noteChanged

    setMutating(true)
    try {
      if (needsEntryPatch) {
        const payload: Record<string, unknown> = {
          session_id: adjustTrackerSession.id,
          job_type: newJobType,
          note: newNote,
        }
        if (timesChanged) {
          payload.start_time = start.toISOString()
          payload.stop_time = end.toISOString()
        }
        await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (reportedChanged) {
        await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: adjustTrackerSession.id,
            duration_adjustment: newReportedSecs,
          }),
        })
      }

      if (!needsEntryPatch && !reportedChanged) {
        message.info('No changes to save')
        throw new Error('no changes')
      }

      message.success('Tracker updated')
      setAdjustTrackerOpen(false)
      setAdjustTrackerSession(null)
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to update')
      throw e
    } finally {
      setMutating(false)
    }
  }

  const deleteSession = async (session: Record<string, unknown>) => {
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker?session_id=${encodeURIComponent(String(session.id))}`, {
        method: 'DELETE',
      })
      message.success('Time entry removed')
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setMutating(false)
    }
  }

  /** Admin: stop another user’s running timer from the list (own timer uses the main Stop button). */
  const stopTimerSessionForRow = async (session: Record<string, unknown>) => {
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', session_id: session.id }),
      })
      message.success('Timer stopped')
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to stop timer')
    } finally {
      setMutating(false)
    }
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ width: '100%' }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
          <Space wrap>
            <ClockCircleOutlined />
            <Text strong>Time Tracker</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total (reported): {formatTime(totalTimeSeconds + (activeTimeTracker ? elapsed : 0))}
            </Text>
          </Space>
          {canAddManual && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openManual}>
              Add manual
            </Button>
          )}
        </Flex>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap align="center">
            {jobTypeOptions.length > 0 ? (
              <Select
                style={{ minWidth: 200, maxWidth: 320 }}
                placeholder="Select job type"
                status={!activeTimeTracker && !timerJobType ? 'warning' : undefined}
                value={timerJobType ?? undefined}
                onChange={(v) => setTimerJobType(v ?? null)}
                options={jobTypeSelectOptions(jobTypeOptions)}
                disabled={!!activeTimeTracker}
              />
            ) : null}
            {activeTimeTracker ? (
              <>
                <Button
                  icon={<PauseCircleOutlined />}
                  onClick={() => { setPaused(true); onStopTimeTracker() }}
                  loading={timeTrackerLoading}
                >
                  Pause
                </Button>
                <Button
                  type="primary"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => { setPaused(false); onStopTimeTracker() }}
                  loading={timeTrackerLoading}
                >
                  Stop
                </Button>
                <Text strong style={{ fontSize: 18 }}>
                  {formatTime(elapsed)}
                </Text>
                <Text type="secondary">(running)</Text>
              </>
            ) : paused ? (
              <>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => { setPaused(false); void onStartTimeTracker(timerJobType) }}
                  loading={timeTrackerLoading}
                  disabled={!timerJobType}
                >
                  Resume
                </Button>
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => setPaused(false)}
                >
                  Stop
                </Button>
                <Text type="warning" strong>Paused</Text>
              </>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => void onStartTimeTracker(timerJobType)}
                loading={timeTrackerLoading}
                disabled={!timerJobType}
                title={timerJobType ? undefined : 'Select a job type first'}
              >
                Start Timer
              </Button>
            )}
          </Space>
          {timeTrackerSessions.length > 0 ? (
            <List
              size="small"
              dataSource={timeTrackerSessions as Record<string, unknown>[]}
              renderItem={(session: Record<string, unknown>) => {
                const owner = isOwner(session)
                const completed = !!session.stop_time
                const canMutate = owner || canManageOthersTime
                const showRowStop = !completed && (owner || canManageOthersTime)
                return (
                  <List.Item
                    style={!completed ? {
                      background: 'rgba(82,196,26,0.05)',
                      borderRadius: 4,
                    } : {}}
                    actions={
                      canMutate
                        ? [
                            ...(showRowStop
                              ? [
                                  <Button
                                    type="link"
                                    size="small"
                                    key="stoprow"
                                    icon={<StopOutlined />}
                                    onClick={() => void stopTimerSessionForRow(session)}
                                    disabled={mutating}
                                  >
                                    Stop
                                  </Button>,
                                ]
                              : []),
                            ...(completed
                              ? [
                                  <Button
                                    type="primary"
                                    key="adjust"
                                    icon={<EditOutlined />}
                                    onClick={() => openAdjustTracker(session)}
                                    disabled={mutating}
                                  >
                                    Adjust tracker
                                  </Button>,
                                ]
                              : []),
                            ...(completed ? [<Popconfirm
                              key="del"
                              title="Remove this time entry?"
                              onConfirm={() => deleteSession(session)}
                              okText="Remove"
                              okButtonProps={{ danger: true }}
                            >
                              <Button type="primary" danger icon={<DeleteOutlined />} disabled={mutating}>
                                Delete
                              </Button>
                            </Popconfirm>] : []),
                          ]
                        : []
                    }
                  >
                    <List.Item.Meta
                      avatar={
                        !completed ? (
                          <Avatar
                            size="small"
                            style={{ background: '#52c41a' }}
                            icon={<ClockCircleOutlined spin />}
                          />
                        ) : (
                          <Avatar
                            icon={<UserOutlined />}
                            size="small"
                            src={(session.user as { avatar_url?: string } | undefined)?.avatar_url}
                          />
                        )
                      }
                      title={
                        <Space size="small" wrap>
                          <Text strong style={{ fontSize: 13 }}>
                            {(session.user as { full_name?: string; email?: string } | undefined)?.full_name ||
                              (session.user as { email?: string } | undefined)?.email ||
                              'Unknown'}
                          </Text>
                          {!completed && <Tag color="processing">Active</Tag>}
                          {session.tracker_type === 'manual' && <Tag color="default">Manual</Tag>}
                          {session.tracker_type === 'timer' && completed ? (
                            <Tag color="blue">Timer</Tag>
                          ) : null}
                          {(session.job_type_title as string | null) || (session.job_type as string | null) ? (
                            <Tag color="purple">
                              {(session.job_type_title as string) || (session.job_type as string)}
                            </Tag>
                          ) : null}
                        </Space>
                      }
                      description={
                        <Space orientation="vertical" size={0}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Started: <DateDisplay date={session.start_time as string} />
                          </Text>
                          {completed ? (
                            <>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Stopped: <DateDisplay date={session.stop_time as string} />
                              </Text>
                              <Text strong style={{ fontSize: 12 }}>
                                Tracked: {formatTime(Number(session.duration_seconds) || 0)}
                                {Number(session.reported_duration_seconds) !==
                                Number(session.duration_seconds) ? (
                                  <>
                                    {' '}
                                    · Reported:{' '}
                                    {formatTime(
                                      Number(session.reported_duration_seconds) ||
                                        Number(session.duration_seconds) ||
                                        0
                                    )}
                                  </>
                                ) : null}
                              </Text>
                              {(session.note as string | null | undefined) ? (
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  Note: {String(session.note)}
                                </Text>
                              ) : null}
                            </>
                          ) : null}
                        </Space>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          ) : (
            <Empty description="No time tracking sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Space>
      </div>

      <Modal
        title="Add manual time"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        onOk={submitManual}
        confirmLoading={mutating}
        destroyOnHidden
      >
        <Form form={manualForm} layout="vertical" style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Log time you already spent. &quot;Worked start&quot; is when the work began; duration runs forward from
            that moment.
            {canManageOthersTime ? ' As admin, you can log time for another user below.' : ''}
          </Text>
          {canManageOthersTime && manualUserOptions.length > 0 ? (
            <Form.Item
              name="forUserId"
              label="User"
              rules={[{ required: true, message: 'Select a user' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={manualUserOptions}
                placeholder="Who worked this time"
                style={{ width: '100%' }}
              />
            </Form.Item>
          ) : null}
          <Form.Item
            name="job_type"
            label="Job type"
            rules={[{ required: true, message: 'Select job type' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="What was this work for?"
              style={{ width: '100%' }}
              options={jobTypeSelectOptions(jobTypeOptions)}
            />
          </Form.Item>
          <Space wrap>
            <Form.Item
              name="hours"
              label="Hours"
              rules={[{ required: true }]}
              style={{ marginBottom: 8, width: 100 }}
            >
              <InputNumber min={0} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="minutes"
              label="Minutes"
              rules={[{ required: true }]}
              style={{ marginBottom: 8, width: 100 }}
            >
              <InputNumber min={0} max={59} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="seconds"
              label="Seconds"
              rules={[{ required: true }]}
              style={{ marginBottom: 8, width: 100 }}
            >
              <InputNumber min={0} max={59} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item
            name="startedAt"
            label="Worked start"
            rules={[
              { required: true, message: 'Pick when work started' },
              {
                validator: (_: unknown, value: Dayjs | null) => {
                  if (!value) return Promise.resolve()
                  if (value.isAfter(dayjs())) {
                    return Promise.reject(new Error('Cannot be in the future'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <DatePicker
              showTime
              style={{ width: '100%' }}
              format="YYYY-MM-DD HH:mm"
              disabledDate={disabledDateNotAfterToday}
              disabledTime={(d) => getDisabledTimeNotAfterNow(d)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Adjust tracker"
        open={adjustTrackerOpen}
        onCancel={() => {
          setAdjustTrackerOpen(false)
          setAdjustTrackerSession(null)
        }}
        onOk={submitAdjustTracker}
        confirmLoading={mutating}
        destroyOnHidden
        width={560}
      >
        <Form form={adjustTrackerForm} layout="vertical" style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Update tracked window, job type, and note. Changing start/stop recalculates tracked duration.
            {canAdjustReportedDuration
              ? ' Reported duration is used for billing and customer reports without changing tracked time.'
              : ''}
          </Text>
          {adjustTrackerSession ? (
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Current tracked: {formatTime(Number(adjustTrackerSession.duration_seconds) || 0)}
            </Text>
          ) : null}
          <Form.Item
            name="range"
            label="Start — Stop"
            rules={[{ required: canAdjustStartStop, message: 'Select start and end' }]}
          >
            <RangePicker
              showTime
              style={{ width: '100%' }}
              format="YYYY-MM-DD HH:mm"
              disabledDate={disabledDateNotAfterToday}
              disabledTime={(d) => getDisabledTimeNotAfterNow(d)}
              disabled={!canAdjustStartStop}
            />
          </Form.Item>
          <Form.Item
            name="job_type"
            label="Job type"
            rules={[{ required: true, message: 'Job type is required' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select job type"
              style={{ width: '100%' }}
              options={jobTypeSelectOptions(jobTypeOptions)}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="Note"
            rules={[
              { required: true, message: 'Note is required' },
              { whitespace: true, message: 'Note is required' },
            ]}
          >
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder="Describe what was done during this time"
            />
          </Form.Item>
          {canAdjustReportedDuration ? (
            <Form.Item
              name="reportedMinutes"
              label="Reported duration (minutes)"
              rules={[{ required: true, message: 'Enter minutes' }]}
            >
              <InputNumber min={0} max={35791394} step={0.01} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </Space>
  )
}
