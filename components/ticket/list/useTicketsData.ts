'use client'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Form, message } from 'antd'
import dayjs from 'dayjs'
import { usePathname, useRouter,useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { isTicketFolder,type TicketFolder } from '@/lib/ticket-classification'
import { resolveDefaultNewTicketStatusSlug } from '@/lib/ticket-default-status'
import type { ParsedUrlFilters } from '@/lib/ticket-filter-url'
import {
  buildSearchStringFromFilters,
  canParseTicketsUrl,
  hasUrlFilterParams,
  parseFiltersFromUrl,
  parseSidebarCollapsedFromUrl,
  URL_PARAMS,
} from '@/lib/ticket-filter-url'
import type { TicketScope } from '@/lib/ticket-scope'
import { isTicketStatusInKanban, ticketStatusDisplayLabel } from '@/lib/ticket-status-kanban'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import {
  buildTicketsListQueryKey,
  normalizeTicketsPageLimit,
  ticketsListQueryKeyPrefix,
  type TicketsPageLimit,
} from '@/lib/tickets-list-query'
import { deleteFile, uploadTicketFileDraft } from '@/utils/storage'

import type { Team, TicketRecord, UserRecord } from './types'
import type { NewTicketAttachment } from './types'
import type { TicketStatusRecord } from './types'
import {
  DEFAULT_ALL_STATUS_COLUMNS,
  DEFAULT_ALL_STATUSES,
  DEFAULT_KANBAN_COLUMNS,
  type StatusColumn,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
} from './types'

export type TicketsDragStartHandler = (event: DragStartEvent) => void
export type TicketsDragEndHandler = (event: DragEndEvent) => Promise<void>

const FILTER_STORAGE_KEY = 'deskteam-tickets-filter'

interface StoredFilter {
  filterStatus?: string[] | null
  filterTypeId?: number | null
  filterTypeIds?: number[] | null
  filterCompanyId?: string | null
  filterCompanyIds?: string[] | null
  filterTagIds?: string[] | null
  filterTeamId?: string | null
  filterTeamIds?: string[] | null
  filterDateRange?: [string | null, string | null] | null
  filterDueDateRange?: [string | null, string | null] | null
  filterSearch?: string | null
  viewMode?: 'kanban' | 'list' | 'card' | 'roundrobin'
  filterSidebarCollapsed?: boolean
  /** Number of tickets fetched per list request (50 / 100 / 200). */
  ticketsPageLimit?: number | null
}

function loadFiltersFromStorage(): StoredFilter | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredFilter
    return parsed
  } catch {
    return null
  }
}

function saveFiltersToStorage(stored: StoredFilter) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // ignore
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

function isRequestAborted(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
}

function priorityFromFormValue(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
}

function getInitialFilterStateFromStored(stored: StoredFilter | null, isCustomer = false): ParsedUrlFilters {
  const defaultStatus = isCustomer
    ? []
    : DEFAULT_KANBAN_COLUMNS.map((c) => c.id)
  return {
    filterStatus: (() => {
      if (stored && Array.isArray(stored.filterStatus)) {
        if (stored.filterStatus.length > 0) return stored.filterStatus
        return []
      }
      if (stored?.filterStatus && stored.filterStatus.length) return stored.filterStatus
      return defaultStatus
    })(),
    filterTypeIds: (() => {
      if (stored && 'filterTypeIds' in stored && Array.isArray(stored.filterTypeIds)) {
        return (stored.filterTypeIds as number[]).filter((n) => typeof n === 'number' && !isNaN(n))
      }
      if (stored?.filterTypeIds && stored.filterTypeIds.length) {
        return stored.filterTypeIds.filter((n) => typeof n === 'number' && !isNaN(n))
      }
      if (stored?.filterTypeId != null && typeof stored.filterTypeId === 'number' && !isNaN(stored.filterTypeId)) {
        return [stored.filterTypeId]
      }
      return []
    })(),
    filterCompanyIds: (() => {
      if (stored && 'filterCompanyIds' in stored && Array.isArray(stored.filterCompanyIds)) {
        return (stored.filterCompanyIds as string[]).map(String).filter(Boolean)
      }
      if (stored?.filterCompanyIds && stored.filterCompanyIds.length) {
        return stored.filterCompanyIds.map(String).filter(Boolean)
      }
      if (stored?.filterCompanyId) return [String(stored.filterCompanyId)]
      return []
    })(),
    filterTagIds: (() => {
      if (stored && 'filterTagIds' in stored && Array.isArray(stored.filterTagIds)) {
        return (stored.filterTagIds as string[]).map(String).filter(Boolean)
      }
      if (stored?.filterTagIds && stored.filterTagIds.length) {
        return stored.filterTagIds.map(String).filter(Boolean)
      }
      return []
    })(),
    filterTeamIds: (() => {
      if (stored && 'filterTeamIds' in stored && Array.isArray(stored.filterTeamIds)) {
        return (stored.filterTeamIds as string[]).map(String).filter(Boolean)
      }
      if (stored?.filterTeamIds && stored.filterTeamIds.length) {
        return stored.filterTeamIds.map(String).filter(Boolean)
      }
      if (stored?.filterTeamId) return [String(stored.filterTeamId)]
      return []
    })(),
    filterDateRange: ((): [dayjs.Dayjs | null, dayjs.Dayjs | null] | null => {
      const dr = stored?.filterDateRange
      if (!dr || !dr[0] || !dr[1]) return null
      const d0 = dayjs(dr[0])
      const d1 = dayjs(dr[1])
      return d0.isValid() && d1.isValid() ? [d0, d1] : null
    })(),
    filterDueDateRange: ((): [dayjs.Dayjs | null, dayjs.Dayjs | null] | null => {
      const dr = stored?.filterDueDateRange
      if (!dr || !dr[0] || !dr[1]) return null
      const d0 = dayjs(dr[0])
      const d1 = dayjs(dr[1])
      return d0.isValid() && d1.isValid() ? [d0, d1] : null
    })(),
    filterSearch: stored?.filterSearch ?? '',
    filterSidebarCollapsed: stored?.filterSidebarCollapsed ?? true,
    viewMode: (stored?.viewMode as 'kanban' | 'list' | 'card' | 'roundrobin') || 'kanban',
    sortBy: TICKETS_LIST_SORT_BY,
    sortOrder: TICKETS_LIST_SORT_ORDER,
    filterTicketType: null,
    filterScope: null,
  }
}

function getInitialViewModeCustomer(isCustomer: boolean, stored: StoredFilter | null): 'kanban' | 'list' | 'card' | 'roundrobin' {
  const storedMode = stored?.viewMode as 'kanban' | 'list' | 'card' | 'roundrobin'
  if (isCustomer && storedMode === 'roundrobin') return 'kanban'
  return storedMode || 'kanban'
}

export function useTicketsData(currentUserId: string, isCustomer = false, canDeleteTicket = false) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  /**
   * SSR + first client render must match: never read localStorage synchronously here.
   * URL params → same on server & client; otherwise defaults from getInitialFilterStateFromStored(null).
   * LocalStorage is applied once after mount in useLayoutEffect (before paint / before passive effects).
   */
  const initialRef = useRef<{ state: ParsedUrlFilters; fromUrl: boolean } | null>(null)
  if (initialRef.current === null) {
    const parsed = canParseTicketsUrl(searchParams)
      ? parseFiltersFromUrl(searchParams, { isCustomer })
      : null

    if (parsed && hasUrlFilterParams(searchParams)) {
      let viewMode = parsed.viewMode
      if (isCustomer && viewMode === 'roundrobin') viewMode = 'kanban'
      let filterTicketType = parsed.filterTicketType
      if (
        isCustomer &&
        isTicketFolder(filterTicketType)
      ) {
        filterTicketType = null
      }
      initialRef.current = { state: { ...parsed, viewMode, filterTicketType }, fromUrl: true }
    } else {
      const state = getInitialFilterStateFromStored(null, isCustomer)
      const viewMode = getInitialViewModeCustomer(isCustomer, null)
      const sidebarFromUrl = parseSidebarCollapsedFromUrl(searchParams)
      let merged: ParsedUrlFilters = {
        ...state,
        filterSidebarCollapsed:
          sidebarFromUrl !== null ? sidebarFromUrl : state.filterSidebarCollapsed,
        viewMode,
      }
      if (parsed) {
        if (searchParams.has(URL_PARAMS.view)) {
          let vm = parsed.viewMode
          if (isCustomer && vm === 'roundrobin') vm = 'kanban'
          merged = { ...merged, viewMode: vm }
        }
        if (searchParams.has(URL_PARAMS.sidebar)) {
          merged = { ...merged, filterSidebarCollapsed: parsed.filterSidebarCollapsed }
        }
      }
      initialRef.current = { state: merged, fromUrl: false }
    }
  }
  const initialState = initialRef.current.state

  const lastKanbanSlugsRef = useRef<string[] | null>(null)
  const applyingFromUrlRef = useRef(false)
  const prevTicketsListSearchRef = useRef<string | null>(null)

  const [collapsed, setCollapsed] = useState(true)
  const [ticketsPageLimit, setTicketsPageLimitState] = useState<TicketsPageLimit>(isCustomer ? 200 : 50)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null)
  const [form] = Form.useForm()
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [ticketTypes, setTicketTypes] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; color?: string }>>([])
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; slug: string; color?: string }>>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  
  const [statusColumns, setStatusColumns] = useState<StatusColumn[]>([])
  const [lookupReady, setLookupReady] = useState(false)
  const [allStatusColumns, setAllStatusColumns] = useState<StatusColumn[]>(DEFAULT_ALL_STATUS_COLUMNS)
  const [allStatuses, setAllStatuses] = useState<Array<{ slug: string; title: string; is_active?: boolean }>>(
    DEFAULT_ALL_STATUSES
  )
  const [filterStatus, setFilterStatus] = useState<string[]>(initialState.filterStatus)
  const [filterTypeIds, setFilterTypeIds] = useState<number[]>(initialState.filterTypeIds)
  const [filterCompanyIds, setFilterCompanyIds] = useState<string[]>(initialState.filterCompanyIds)
  const [filterTagIds, setFilterTagIds] = useState<string[]>(initialState.filterTagIds)
  const [filterTeamIds, setFilterTeamIds] = useState<string[]>(initialState.filterTeamIds)
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(initialState.filterDateRange)
  const [filterDueDateRange, setFilterDueDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(
    initialState.filterDueDateRange ?? null
  )
  const [filterSearch, setFilterSearch] = useState(initialState.filterSearch)
  const [submitting, setSubmitting] = useState(false)
  const [filterSidebarCollapsed, setFilterSidebarCollapsed] = useState(initialState.filterSidebarCollapsed)
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'card' | 'roundrobin'>(initialState.viewMode)
  const [filterTicketType, setFilterTicketType] = useState<TicketFolder | null>(
    initialState.filterTicketType ?? null
  )
  /** Inbox (unassigned) / My tickets; null = all tickets. Driven by the URL (sidebar links). */
  const [filterScope, setFilterScope] = useState<TicketScope | null>(initialState.filterScope ?? null)
  const [newTicketAttachments, setNewTicketAttachments] = useState<NewTicketAttachment[]>([])
  const [deletedTicketAttachmentIds, setDeletedTicketAttachmentIds] = useState<string[]>([])
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null)
  const [userTeamIds, setUserTeamIds] = useState<string[]>([])

  const [committedSearch, setCommittedSearch] = useState(initialState.filterSearch ?? '')
  const debouncedSearch = committedSearch

  const [searchFields, setSearchFields] = useState<string>('title,description')

  const commitSearch = (val: string) => {
    setCommittedSearch(val)
    if (!val.trim()) setFilterSearch('')
  }

  const columnsToShow = useMemo(() => {
    if (allStatusColumns.length === 0) return []
    if (filterStatus.length === 0) return allStatusColumns
    const allowed = new Set(filterStatus)
    return allStatusColumns.filter((c) => allowed.has(c.id))
  }, [filterStatus, allStatusColumns])

  const defaultKanbanStatusKey = useMemo(
    () => [...statusColumns.map((c) => c.id)].sort().join(','),
    [statusColumns]
  )

  const statusFilterIsRestrictive = useMemo(() => {
    if (statusColumns.length === 0) return false
    if (filterStatus.length === 0) return false
    if (
      isCustomer &&
      lookupReady &&
      allStatuses.length > 0 &&
      filterStatus.length === allStatuses.length &&
      allStatuses.every((s) => filterStatus.includes(s.slug))
    ) {
      return false
    }
    return [...filterStatus].sort().join(',') !== defaultKanbanStatusKey
  }, [filterStatus, defaultKanbanStatusKey, statusColumns.length, isCustomer, lookupReady, allStatuses])

  const hasActiveFilters =
    statusFilterIsRestrictive ||
    filterTypeIds.length > 0 ||
    filterCompanyIds.length > 0 ||
    filterTagIds.length > 0 ||
    filterTeamIds.length > 0 ||
    (filterDateRange != null && filterDateRange[0] != null && filterDateRange[1] != null) ||
    (filterDueDateRange != null && filterDueDateRange[0] != null && filterDueDateRange[1] != null) ||
    filterSearch.trim() !== '' ||
    filterTicketType != null

  const clearFilters = useCallback(() => {
    setFilterTicketType(null)
    setFilterStatus(
      isCustomer && allStatuses.length > 0
        ? allStatuses.map((s) => s.slug)
        : statusColumns.map((c) => c.id)
    )
    setFilterTypeIds([])
    setFilterCompanyIds([])
    setFilterTagIds([])
    setFilterTeamIds([])
    setFilterDateRange(null)
    setFilterDueDateRange(null)
    setFilterSearch('')
  }, [statusColumns, isCustomer, allStatuses])

  const queryClient = useQueryClient()

  // list/card have built-in pagination so fetch all; kanban/RR show cards at once → use user limit
  const effectiveTicketsLimit = (viewMode === 'list' || viewMode === 'card') ? 9999 : ticketsPageLimit

  const ticketsListQueryKey = useMemo(
    () =>
      buildTicketsListQueryKey({
        isCustomer,
        ticketsPageLimit: effectiveTicketsLimit,
        filterCompanyIds,
        filterStatus,
        filterTypeIds,
        filterTagIds,
        filterTeamIds,
        filterDateRange,
        filterDueDateRange,
        debouncedSearch,
        filterTicketType,
        filterScope,
        lookupReady,
        searchFields,
      }),
    [
      isCustomer,
      effectiveTicketsLimit,
      filterCompanyIds,
      filterStatus,
      filterTypeIds,
      filterTagIds,
      filterTeamIds,
      filterDateRange,
      filterDueDateRange,
      debouncedSearch,
      filterTicketType,
      filterScope,
      lookupReady,
      searchFields,
    ]
  )

  const ticketsListQueryKeyRef = useRef(ticketsListQueryKey)
  ticketsListQueryKeyRef.current = ticketsListQueryKey

  const ticketsQuery = useQuery({
    queryKey: ticketsListQueryKey,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams()
      const inJunkFolder =
        !isCustomer && isTicketFolder(filterTicketType)
      if (inJunkFolder) params.set('ticket_type', filterTicketType!)
      else if (!isCustomer && filterScope) params.set('scope', filterScope)
      if (!isCustomer) {
        const noCompany = filterCompanyIds.includes('__none__')
        const realCompanyIds = filterCompanyIds.filter((id) => id !== '__none__')
        if (noCompany) params.set('no_company', '1')
        if (realCompanyIds.length > 0) params.set('company_ids', realCompanyIds.join(','))
        const noTeam = filterTeamIds.includes('__none__')
        const realTeamIds = filterTeamIds.filter((id) => id !== '__none__')
        if (noTeam && !inJunkFolder) params.set('no_team', '1')
        if (realTeamIds.length > 0 && !inJunkFolder) params.set('team_ids', realTeamIds.join(','))
      }
      const noTags = filterTagIds.includes('__none__')
      const realTagIds = filterTagIds.filter((id) => id !== '__none__')
      if (noTags) params.set('no_tags', '1')
      if (realTagIds.length > 0) params.set('tag_ids', realTagIds.join(','))
      const customerShowsAllStatuses =
        isCustomer &&
        lookupReady &&
        allStatuses.length > 0 &&
        filterStatus.length === allStatuses.length &&
        allStatuses.every((s) => filterStatus.includes(s.slug))
      const sendStatusToApi =
        filterStatus.length > 0 &&
        !inJunkFolder &&
        (isCustomer ? lookupReady && !customerShowsAllStatuses : true)
      if (sendStatusToApi) params.set('status', filterStatus.join(','))
      if (filterTypeIds.length > 0) params.set('type_ids', filterTypeIds.join(','))
      if (filterDateRange?.[0] && filterDateRange?.[1]) {
        params.set('date_from', filterDateRange[0].startOf('day').toISOString())
        params.set('date_to', filterDateRange[1].endOf('day').toISOString())
      }
      if (filterDueDateRange?.[0] && filterDueDateRange?.[1]) {
        params.set('due_date_from', filterDueDateRange[0].startOf('day').toISOString())
        params.set('due_date_to', filterDueDateRange[1].endOf('day').toISOString())
      }
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
        params.set('search_fields', searchFields || 'title,description')
      }
      params.set('limit', String(effectiveTicketsLimit))

      const qs = params.toString()
      const url = qs ? `/api/tickets?${qs}` : '/api/tickets'
      try {
        return await apiFetch<TicketRecord[]>(url, { signal })
      } catch (error: unknown) {
        if (isRequestAborted(error, signal)) {
          throw error
        }
        message.error((error as Error).message || 'Failed to fetch tickets')
        throw error
      }
    },
  })

  const tickets = ticketsQuery.data ?? []
  const loading = ticketsQuery.isFetching

  /** Server returns filtered data - no client-side filtering */
  const filteredTickets = tickets

  const invalidateTicketsList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyPrefix() })
  }, [queryClient])

  const setTicketsPageLimit = useCallback((v: TicketsPageLimit) => {
    setTicketsPageLimitState(v)
  }, [])

  const storageHydratedRef = useRef(false)
  useLayoutEffect(() => {
    if (storageHydratedRef.current) return
    storageHydratedRef.current = true
    if (initialRef.current?.fromUrl) return
    const stored = loadFiltersFromStorage()
    if (!stored || Object.keys(stored).length === 0) return
    const state = getInitialFilterStateFromStored(stored, isCustomer)
    const vm = getInitialViewModeCustomer(isCustomer, stored)
    setFilterStatus(state.filterStatus)
    setFilterTypeIds(state.filterTypeIds)
    setFilterCompanyIds(state.filterCompanyIds)
    setFilterTagIds(state.filterTagIds)
    setFilterTeamIds(state.filterTeamIds)
    setFilterDateRange(state.filterDateRange)
    setFilterDueDateRange(state.filterDueDateRange ?? null)
    setFilterSearch(state.filterSearch)
    setFilterSidebarCollapsed(state.filterSidebarCollapsed)
    setViewMode(vm)
    setTicketsPageLimitState(normalizeTicketsPageLimit(stored.ticketsPageLimit))
    setCommittedSearch(state.filterSearch)
    try {
      const savedPrefs = localStorage.getItem('ticket-search-prefs')
      if (savedPrefs) {
        const p = JSON.parse(savedPrefs) as Record<string, boolean>
        const fields = Object.entries(p).filter(([, v]) => v).map(([k]) => k).join(',')
        if (fields) setSearchFields(fields)
      }
    } catch { /* ignore */ }
  }, [isCustomer])

  const fetchLookup = async () => {
    try {
      setLookupReady(false)
      const data = await apiFetch<{
        userTeamIds?: string[]
        userCompanyId?: string | null
        teams: Team[]
        users: UserRecord[]
        ticketTypes: Array<{ id: number; title: string; slug: string; color: string }>
        companies: Array<{ id: string; name: string; color?: string }>
        tags: Array<{ id: string; name: string; slug: string; color?: string }>
        statuses: Array<TicketStatusRecord & { show_in_kanban?: boolean | null; is_active?: boolean }>
      }>('/api/tickets/lookup')

      setTeams(data.teams || [])
      setUsers(data.users || [])
      setTicketTypes(data.ticketTypes || [])
      setCompanies(data.companies || [])
      setAllTags(data.tags || [])
      setUserCompanyId(data.userCompanyId ?? null)
      setUserTeamIds(data.userTeamIds || [])

      const stored = loadFiltersFromStorage()
      const fromUrl = initialRef.current?.fromUrl
      const hasStoredTeamPreference = stored && ('filterTeamIds' in stored || 'filterTeamId' in stored)
      if (!fromUrl && !hasStoredTeamPreference && data.userTeamIds?.length === 1) {
        setFilterTeamIds([data.userTeamIds[0]])
      }

      const list = data.statuses || []
      if (list.length > 0) {
        const statusTitle = (s: { slug: string; title: string; customer_title?: string; color: string }) =>
          ticketStatusDisplayLabel(s, { preferCustomerTitle: isCustomer })
        const inKanban = (s: { show_in_kanban?: unknown }) => isTicketStatusInKanban(s.show_in_kanban)
        const isActive = (s: { is_active?: boolean }) => s.is_active !== false
        const activeList = list.filter(isActive)
        const kanbanSlugs = activeList.filter(inKanban).map((s) => s.slug)
        setStatusColumns(
          activeList.filter(inKanban).map((s) => ({ id: s.slug, title: statusTitle(s), color: s.color }))
        )
        setAllStatusColumns(activeList.map((s) => ({ id: s.slug, title: statusTitle(s), color: s.color })))
        setAllStatuses(
          list.map((s) => ({
            slug: s.slug,
            title: statusTitle(s),
            is_active: s.is_active !== false,
          }))
        )
        const validSlugs = new Set(list.map((s) => s.slug))
        if (fromUrl) {
          const current = initialRef.current?.state.filterStatus ?? []
          const intersection = current.filter((slug: string) => validSlugs.has(slug))
          const allSlugs = list.map((s) => s.slug)
          const nonClosedSlugs = list.filter((s) => !isClosedLikeTicketStatus(s.slug)).map((s) => s.slug)
          const resolvedStatus =
            intersection.length > 0 ? intersection : isCustomer ? nonClosedSlugs : kanbanSlugs
          setFilterStatus(resolvedStatus)
          lastKanbanSlugsRef.current = kanbanSlugs
          saveFiltersToStorage({ ...(stored || {}), filterStatus: resolvedStatus } as StoredFilter)
        } else {
          if (isCustomer) {
            const allSlugs = list.map((s) => s.slug)
            const hasStoredStatusPreference =
              stored && 'filterStatus' in stored && Array.isArray(stored.filterStatus)
            const fromStore = hasStoredStatusPreference
              ? (stored.filterStatus as string[]).filter((slug: string) => validSlugs.has(slug))
              : null
            const nonClosedSlugs = list.filter((s) => !isClosedLikeTicketStatus(s.slug)).map((s) => s.slug)
            setFilterStatus(
              fromStore !== null ? (fromStore.length > 0 ? fromStore : nonClosedSlugs) : nonClosedSlugs
            )
            lastKanbanSlugsRef.current = kanbanSlugs
          } else {
            // Merge newly kanban-visible slugs (e.g. user enabled Show in Kanban for Cancel/Archived) into the API filter.
            setFilterStatus((prev) => {
              let next: string[]
              if (prev.length > 0) {
                const pruned = prev.filter((slug) => validSlugs.has(slug))
                next = pruned.length > 0 ? pruned : kanbanSlugs
              } else {
                const hasStoredStatusPreference =
                  stored && 'filterStatus' in stored && Array.isArray(stored.filterStatus)
                if (hasStoredStatusPreference) {
                  const intersection = (stored.filterStatus as string[]).filter((slug: string) =>
                    validSlugs.has(slug)
                  )
                  next = intersection.length > 0 ? intersection : []
                } else {
                  next = kanbanSlugs
                }
              }
              const prevKanban = lastKanbanSlugsRef.current
              lastKanbanSlugsRef.current = kanbanSlugs
              if (prevKanban === null) {
                if (next.length === 0) return []
                const extra = next.filter((s) => !kanbanSlugs.includes(s) && validSlugs.has(s))
                return [...new Set([...kanbanSlugs, ...extra])]
              }
              const newlyAdded = kanbanSlugs.filter((s) => !prevKanban.includes(s))
              if (newlyAdded.length === 0) return next
              return [...new Set([...next, ...newlyAdded])]
            })
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch lookup data:', error)
    } finally {
      setLookupReady(true)
    }
  }

  useEffect(() => {
    lastKanbanSlugsRef.current = null
    fetchLookup()
  }, [isCustomer])

  const searchParamsKey = searchParams.toString()

  useEffect(() => {
    const isTicketsList = pathname === '/tickets' || pathname === '/tickets/'
    if (!isTicketsList) return

    if (prevTicketsListSearchRef.current === null) {
      prevTicketsListSearchRef.current = searchParamsKey
      return
    }
    if (prevTicketsListSearchRef.current === searchParamsKey) return
    prevTicketsListSearchRef.current = searchParamsKey

    applyingFromUrlRef.current = true

    if (hasUrlFilterParams(searchParams) || searchParams.get(URL_PARAMS.preset) === '1') {
      let parsed = parseFiltersFromUrl(searchParams, { isCustomer })
      if (!parsed) {
        applyingFromUrlRef.current = false
        return
      }
      if (isCustomer && parsed.viewMode === 'roundrobin') {
        parsed = { ...parsed, viewMode: 'kanban' }
      }
      if (
        isCustomer &&
        isTicketFolder(parsed.filterTicketType)
      ) {
        parsed = { ...parsed, filterTicketType: null }
      }
      const isJunkUrl = isTicketFolder(parsed.filterTicketType)

      const applyStatusFromParsed = () => {
        let statuses = parsed.filterStatus
        if (
          !isJunkUrl &&
          lookupReady &&
          allStatuses.length > 0 &&
          statusColumns.length > 0
        ) {
          const valid = new Set(allStatuses.map((s) => s.slug))
          const pruned = statuses.filter((s) => valid.has(s))
          if (pruned.length > 0) {
            statuses = pruned
          } else if (statuses.length === 0) {
            statuses = []
          } else if (isCustomer && allStatuses.length > 0) {
            statuses = allStatuses.map((s) => s.slug)
          } else {
            statuses = statusColumns.map((c) => c.id)
          }
        }
        setFilterStatus(statuses)
      }

      if (isJunkUrl) {
        applyStatusFromParsed()
        setFilterTypeIds(parsed.filterTypeIds)
        setFilterCompanyIds(parsed.filterCompanyIds)
        setFilterTagIds(parsed.filterTagIds)
        setFilterTeamIds(parsed.filterTeamIds)
        setFilterDateRange(parsed.filterDateRange)
        setFilterDueDateRange(parsed.filterDueDateRange ?? null)
        setFilterSearch(parsed.filterSearch)
        setViewMode(parsed.viewMode)
        setFilterSidebarCollapsed(parsed.filterSidebarCollapsed)
        setFilterTicketType(parsed.filterTicketType ?? null)
        setFilterScope(null)
      } else if (searchParams.get(URL_PARAMS.preset) === '1') {
        // Saved preset navigation: apply ALL fields so absent params (= "all") correctly reset state.
        applyStatusFromParsed()
        setFilterTypeIds(parsed.filterTypeIds)
        setFilterCompanyIds(parsed.filterCompanyIds)
        setFilterTagIds(parsed.filterTagIds)
        setFilterTeamIds(parsed.filterTeamIds)
        setFilterDateRange(parsed.filterDateRange)
        setFilterDueDateRange(parsed.filterDueDateRange ?? null)
        setFilterSearch(parsed.filterSearch)
        // Only apply viewMode if explicitly present in URL — preset=1 is always added by the save
        // effect even without a view param, so absent view means "keep current / localStorage value".
        if (searchParams.has(URL_PARAMS.view)) setViewMode(parsed.viewMode)
        setFilterTicketType(parsed.filterTicketType ?? null)
        setFilterScope(parsed.filterScope ?? null)
      } else {
        /** Only apply fields actually present in the URL. `view` alone (without `status`) used to make parsed.filterStatus [] and overwrite state → unnecessary refetch. */
        if (searchParams.has(URL_PARAMS.status)) applyStatusFromParsed()
        if (searchParams.has(URL_PARAMS.type_ids)) setFilterTypeIds(parsed.filterTypeIds)
        if (searchParams.has(URL_PARAMS.company_ids)) setFilterCompanyIds(parsed.filterCompanyIds)
        if (searchParams.has(URL_PARAMS.tag_ids)) setFilterTagIds(parsed.filterTagIds)
        if (searchParams.has(URL_PARAMS.team_ids)) setFilterTeamIds(parsed.filterTeamIds)
        if (searchParams.has(URL_PARAMS.date_from) && searchParams.has(URL_PARAMS.date_to)) {
          setFilterDateRange(parsed.filterDateRange)
        }
        if (searchParams.has(URL_PARAMS.due_date_from) && searchParams.has(URL_PARAMS.due_date_to)) {
          setFilterDueDateRange(parsed.filterDueDateRange ?? null)
        }
        if (searchParams.has(URL_PARAMS.search)) setFilterSearch(parsed.filterSearch)
        if (searchParams.has(URL_PARAMS.view)) setViewMode(parsed.viewMode)
        if (searchParams.has(URL_PARAMS.sidebar)) setFilterSidebarCollapsed(parsed.filterSidebarCollapsed)
        if (searchParams.has(URL_PARAMS.ticket_type)) setFilterTicketType(parsed.filterTicketType ?? null)
        // Scope is navigation (sidebar): absent = all tickets
        setFilterScope(parsed.filterScope ?? null)
      }
    } else if (canParseTicketsUrl(searchParams)) {
      let parsed = parseFiltersFromUrl(searchParams, { isCustomer })
      if (!parsed) {
        applyingFromUrlRef.current = false
        return
      }
      if (isCustomer && parsed.viewMode === 'roundrobin') {
        parsed = { ...parsed, viewMode: 'kanban' }
      }
      if (
        isCustomer &&
        isTicketFolder(parsed.filterTicketType)
      ) {
        parsed = { ...parsed, filterTicketType: null }
      }
      if (searchParams.has(URL_PARAMS.view)) setViewMode(parsed.viewMode)
      if (searchParams.has(URL_PARAMS.sidebar)) setFilterSidebarCollapsed(parsed.filterSidebarCollapsed)
    } else {
      const sidebarOnly = parseSidebarCollapsedFromUrl(searchParams)
      if (sidebarOnly !== null) {
        setFilterSidebarCollapsed(sidebarOnly)
      } else {
        const fallbackStatus =
          lookupReady && allStatuses.length > 0 && isCustomer
            ? allStatuses.map((s) => s.slug)
            : lookupReady && statusColumns.length > 0
              ? statusColumns.map((c) => c.id)
              : isCustomer
                ? []
                : DEFAULT_KANBAN_COLUMNS.map((c) => c.id)
        setFilterStatus(fallbackStatus)
        setFilterTypeIds([])
        setFilterCompanyIds([])
        setFilterTagIds([])
        setFilterTeamIds([])
        setFilterDateRange(null)
        setFilterDueDateRange(null)
        setFilterSearch('')
        setViewMode('kanban')
        setFilterSidebarCollapsed(true)
        setFilterTicketType(null)
        setFilterScope(null)
      }
    }
  }, [
    pathname,
    searchParamsKey,
    searchParams,
    isCustomer,
    lookupReady,
    allStatuses,
    statusColumns,
  ])

  /** On every filter change: save to localStorage + update URL (so link can be shared) */
  useEffect(() => {
    saveFiltersToStorage({
      filterStatus,
      filterTypeIds,
      filterCompanyIds,
      filterTagIds,
      filterTeamIds,
      filterDateRange:
        filterDateRange?.[0] && filterDateRange?.[1]
          ? [filterDateRange[0].toISOString(), filterDateRange[1].toISOString()]
          : null,
      filterDueDateRange:
        filterDueDateRange?.[0] && filterDueDateRange?.[1]
          ? [filterDueDateRange[0].toISOString(), filterDueDateRange[1].toISOString()]
          : null,
      filterSearch: filterSearch || null,
      viewMode: viewMode,
      filterSidebarCollapsed: filterSidebarCollapsed,
      ticketsPageLimit,
    })

    if (applyingFromUrlRef.current) {
      applyingFromUrlRef.current = false
      return
    }

    /** Always write filter state to URL so link can be shared */
    if (pathname) {
      const qs = buildSearchStringFromFilters({
        filterStatus,
        filterTypeIds,
        filterCompanyIds,
        filterTagIds,
        filterTeamIds,
        filterDateRange,
        filterDueDateRange,
        filterSearch,
        viewMode,
        filterTicketType: isCustomer ? null : filterTicketType,
        filterScope: isCustomer ? null : filterScope,
      })
      const url = qs ? `${pathname}?${qs}` : pathname
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + (window.location.search || '') : ''
      if (url !== currentUrl) {
        router.replace(url, { scroll: false })
      }
    }
  }, [
    pathname,
    router,
    filterStatus,
    filterTypeIds,
    filterCompanyIds,
    filterTagIds,
    filterTeamIds,
    filterDateRange,
    filterDueDateRange,
    filterSearch,
    viewMode,
    filterSidebarCollapsed,
    filterTicketType,
    filterScope,
    isCustomer,
    ticketsPageLimit,
  ])

  const getFilterQueryString = useCallback(() => {
    return buildSearchStringFromFilters({
      filterStatus,
      filterTypeIds,
      filterCompanyIds,
      filterTagIds,
      filterTeamIds,
      filterDateRange,
      filterDueDateRange,
      filterSearch,
      viewMode,
      filterTicketType: isCustomer ? null : filterTicketType,
      filterScope: isCustomer ? null : filterScope,
    })
  }, [
    filterStatus,
    filterTypeIds,
    filterCompanyIds,
    filterTagIds,
    filterTeamIds,
    filterDateRange,
    filterDueDateRange,
    filterSearch,
    viewMode,
    filterTicketType,
    filterScope,
    isCustomer,
  ])

  useEffect(() => {
    if (!isCustomer) return
    if (isTicketFolder(filterTicketType)) {
      setFilterTicketType(null)
    }
  }, [isCustomer, filterTicketType])

  const filterByStatusFromChip = useCallback((slug: string) => {
    setFilterStatus([slug])
  }, [])

  const filterByTagFromChip = useCallback((tagId: string) => {
    setFilterTagIds([tagId])
  }, [])

  const filterByCompanyFromChip = useCallback((companyId: string) => {
    setFilterCompanyIds([companyId])
  }, [])

  useEffect(() => {
    if (
      !isCustomer &&
      isTicketFolder(filterTicketType) &&
      viewMode !== 'card'
    ) {
      setViewMode('card')
    }
  }, [filterTicketType, viewMode, isCustomer])

  const handleDragStart: TicketsDragStartHandler = (event) => {
    const raw = event.active.id
    const id = typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw as number)
    setActiveId(Number.isFinite(id) ? id : null)
  }

  const handleDragEnd: TicketsDragEndHandler = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeRaw = active.id
    const ticketId = typeof activeRaw === 'string' ? Number.parseInt(activeRaw, 10) : (activeRaw as number)
    if (Number.isNaN(ticketId)) return

    const overId = over.id
    const overAsColumnId = String(overId)
    let newStatus: string
    if (columnsToShow.some((c) => c.id === overAsColumnId)) {
      newStatus = overAsColumnId
    } else {
      const overNum = typeof overId === 'string' ? Number.parseInt(overId, 10) : (overId as number)
      const hit = tickets.find((t) => t.id === overNum)
      if (!hit) return
      newStatus = hit.status as string
    }

    const prevTicket = tickets.find((t) => t.id === ticketId)

    queryClient.setQueryData<TicketRecord[]>(ticketsListQueryKeyRef.current, (prev) =>
      (prev ?? []).map((t) => {
        if (t.id !== ticketId) return t
        const isSupportScoped =
          (t.ticket_type ?? 'support') === 'support' && t.company_id != null
        const droppingFromQueue =
          isSupportScoped && isClosedLikeTicketStatus(newStatus) && !isClosedLikeTicketStatus(t.status)
        return {
          ...t,
          status: newStatus as TicketRecord['status'],
          ...(droppingFromQueue ? { priority: null } : {}),
        }
      })
    )

    try {
      await apiFetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      message.success('Ticket status updated successfully')
      const prevSt = prevTicket?.status
      const reopenOrCloseSupport =
        prevTicket &&
        (prevTicket.ticket_type ?? 'support') === 'support' &&
        prevTicket.company_id &&
        (isClosedLikeTicketStatus(newStatus) !== isClosedLikeTicketStatus(prevSt ?? ''))
      if (reopenOrCloseSupport) {
        void invalidateTicketsList()
      }
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to update ticket status')
      invalidateTicketsList()
    }
  }

  const handleCreate = () => {
    setEditingTicket(null)
    setSelectedAssignees([])
    setSelectedTagIds([])
    setNewTicketAttachments([])
    setDeletedTicketAttachmentIds([])
    form.resetFields()
    const baseValues: Record<string, unknown> = {
      priority: 0,
    }
    if (isCustomer && userCompanyId) {
      baseValues.company_id = userCompanyId
    }
    form.setFieldsValue(baseValues)
    setModalVisible(true)
  }

  const handleEdit = (record: TicketRecord) => {
    setEditingTicket(record)
    setNewTicketAttachments([])
    setDeletedTicketAttachmentIds([])
    const assigneeIds = record.assignees?.map((a) => a.user_id) || []
    setSelectedAssignees(assigneeIds)
    setSelectedTagIds(record.tags?.map((t) => t.id) || [])
    form.setFieldsValue({
      title: record.title,
      description: record.description ?? '',
      short_note: record.short_note || '',
      status: record.status,
      team_id: record.team_id,
      type_id: record.type_id ?? undefined,
      priority: priorityFromFormValue(record.priority),
      company_id: record.company_id ?? undefined,
      contact_user_id: record.contact_user_id ?? undefined,
      due_date: record.due_date ? dayjs(record.due_date) : null,
    })
    setModalVisible(true)
  }

  const handleTicketFilesSelected = async (files: File[] | FileList | null) => {
    const arr = files ? Array.from(files) : []
    if (!arr.length) return
    if (editingTicket && !isCustomer) return
    setAttachmentUploading(true)
    try {
      const companyId = isCustomer
        ? userCompanyId ?? undefined
        : (form.getFieldValue('company_id') as string | undefined)
      const companyName = companyId ? companies.find((c) => c.id === companyId)?.name : undefined
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const result = await uploadTicketFileDraft(file, 'attachments', companyName)
        if (result.url && result.path) {
          setNewTicketAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
        } else if (result.error) {
          message.error(`${file.name}: ${result.error}`)
        }
      }
    } catch {
      message.error('Failed to upload file')
    } finally {
      setAttachmentUploading(false)
    }
  }

  const handleDelete = async (ticketId: number) => {
    if (!canDeleteTicket) {
      message.error('Only admins and managers can move tickets to trash')
      return
    }
    queryClient.setQueryData<TicketRecord[]>(ticketsListQueryKeyRef.current, (prev) =>
      (prev ?? []).filter((t) => t.id !== ticketId)
    )
    try {
      await apiFetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      message.success('Ticket moved to trash')
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to move ticket to trash')
      invalidateTicketsList()
    }
  }

  const handleBulkMoveToTrash = async (ids: number[]) => {
    if (!ids.length || isCustomer || !canDeleteTicket) return
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_type: 'trash' }),
          })
        )
      )
      message.success(`Moved ${ids.length} ticket(s) to trash`)
      await queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyPrefix() })
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to move tickets to trash')
      await queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyPrefix() })
    }
  }

  const handleBulkMoveToSpam = async (ids: number[]) => {
    if (!ids.length || isCustomer) return
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_type: 'spam' }),
          })
        )
      )
      message.success(`Moved ${ids.length} ticket(s) to spam`)
      await queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyPrefix() })
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to move tickets to spam')
      await queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyPrefix() })
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const customerEditing = Boolean(isCustomer && editingTicket)
      const newTicketDefaultStatus = resolveDefaultNewTicketStatusSlug(allStatuses)

      const effectiveValues = { ...values }
      if (isCustomer && !editingTicket) {
        effectiveValues.status = newTicketDefaultStatus
        effectiveValues.company_id = userCompanyId ?? null
      }

      const teamIdNormalized =
        typeof effectiveValues.team_id === 'string' && effectiveValues.team_id.trim() !== ''
          ? effectiveValues.team_id
          : null

      const sharedBody: Record<string, unknown> = {
        title: effectiveValues.title,
        short_note: effectiveValues.short_note || null,
        team_id: teamIdNormalized,
        type_id: effectiveValues.type_id ?? null,
        priority: priorityFromFormValue(effectiveValues.priority),
        company_id: effectiveValues.company_id ?? null,
        contact_user_id: effectiveValues.contact_user_id ?? null,
        due_date: effectiveValues.due_date ? (effectiveValues.due_date as dayjs.Dayjs).toISOString() : null,
      }

      const mapAssignees = (ids: string[]) =>
        ids.map((userId) => ({
          id: `temp-${userId}`,
          user_id: userId,
          user_name: users.find((u) => u.id === userId)?.full_name || users.find((u) => u.id === userId)?.email || 'Unknown',
        }))

      if (editingTicket) {
        if (customerEditing) {
          const attachBody: Record<string, unknown> = {
            title: values.title,
            description: values.description ?? null,
            type_id: values.type_id ?? null,
            priority: priorityFromFormValue(values.priority),
          }
          if (newTicketAttachments.length > 0) {
            attachBody.attachments_add = newTicketAttachments.map((a) => ({
              file_url: a.url,
              file_name: a.file_name,
              file_path: a.file_path,
            }))
          }
          if (deletedTicketAttachmentIds.length > 0) {
            attachBody.attachments_delete = deletedTicketAttachmentIds
          }

          await apiFetch(`/api/tickets/${editingTicket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(attachBody),
          })

          message.success('Ticket updated successfully')
          await queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyPrefix() })
        } else {
          const patchRes = await apiFetch<{
            ok?: boolean
            company_id?: string | null
            ticket_cross_company_warning?: string
          }>(`/api/tickets/${editingTicket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...sharedBody,
              status: effectiveValues.status,
              assignees: selectedAssignees,
              tag_ids: selectedTagIds,
            }),
          })

          message.success('Ticket updated successfully')
          if (patchRes?.ticket_cross_company_warning) {
            message.warning(patchRes.ticket_cross_company_warning)
          }

          const typeId = values.type_id as number | undefined
          const priorityVal = priorityFromFormValue(values.priority)
          const companyId =
            patchRes && typeof patchRes === 'object' && 'company_id' in patchRes
              ? patchRes.company_id
              : ((values.company_id as string | undefined) ?? null)
          const teamId = teamIdNormalized
          const updatedRecord: TicketRecord = {
            ...editingTicket,
            title: values.title as string,
            short_note: (values.short_note as string) || null,
            status: values.status as TicketRecord['status'],
            team_id: teamId ?? null,
            type_id: typeId ?? null,
            priority: priorityVal,
            company_id: companyId ?? null,
            contact_user_id: (values.contact_user_id as string | undefined) ?? null,
            due_date: values.due_date ? (values.due_date as dayjs.Dayjs).toISOString() : null,
            updated_at: new Date().toISOString(),
            team_name: teamId ? teams.find((t) => t.id === teamId)?.name ?? undefined : undefined,
            type: typeId != null ? ticketTypes.find((t) => t.id === typeId) ?? null : null,
            company: companyId ? companies.find((c) => c.id === companyId) ?? null : null,
            tags: allTags.filter((t) => selectedTagIds.includes(t.id)),
            assignees: mapAssignees(selectedAssignees),
          }
          queryClient.setQueryData<TicketRecord[]>(ticketsListQueryKeyRef.current, (prev) =>
            (prev ?? []).map((t) => (t.id === editingTicket.id ? updatedRecord : t))
          )
        }
      } else {
        const createPayload = {
          ...sharedBody,
          status: newTicketDefaultStatus,
          description: values.description || null,
          tag_ids: selectedTagIds,
          contact_user_id: effectiveValues.contact_user_id ?? null,
          attachments: newTicketAttachments.map((a) => ({
            file_url: a.url,
            file_name: a.file_name,
            file_path: a.file_path,
          })),
        }
        const newTicket = await apiFetch<{
          id: number
          created_at: string
          updated_at: string
          company_id?: string | null
          ticket_cross_company_warning?: string
        }>('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        })

        message.success('Ticket created successfully')
        if (newTicket.ticket_cross_company_warning) {
          message.warning(newTicket.ticket_cross_company_warning)
        }

        const typeId = effectiveValues.type_id as number | undefined
        const priorityVal = priorityFromFormValue(effectiveValues.priority)
        const companyId =
          newTicket.company_id !== undefined
            ? newTicket.company_id
            : ((effectiveValues.company_id as string | undefined) ?? null)
        const teamId = teamIdNormalized ?? undefined
        const newRecord: TicketRecord = {
          id: newTicket.id,
          title: effectiveValues.title as string,
          description: (effectiveValues.description as string) || null,
          short_note: (effectiveValues.short_note as string) || null,
          created_by: currentUserId,
          contact_user_id: (effectiveValues.contact_user_id as string | undefined) ?? null,
          due_date: effectiveValues.due_date ? (effectiveValues.due_date as dayjs.Dayjs).toISOString() : null,
          status: newTicketDefaultStatus as TicketRecord['status'],
          team_id: teamId ?? null,
          type_id: typeId ?? null,
          priority: priorityVal,
          company_id: companyId ?? null,
          created_at: newTicket.created_at,
          updated_at: newTicket.updated_at,
          creator_name: users.find((u) => u.id === currentUserId)?.full_name || users.find((u) => u.id === currentUserId)?.email || 'Unknown',
          team_name: teamId ? teams.find((t) => t.id === teamId)?.name ?? undefined : undefined,
          type: typeId != null ? ticketTypes.find((t) => t.id === typeId) ?? null : null,
          company: companyId ? companies.find((c) => c.id === companyId) ?? null : null,
          tags: allTags.filter((t) => selectedTagIds.includes(t.id)),
          assignees: [],
          checklist_completed: 0,
          checklist_total: 0,
          has_unread_replies: false,
        }
        queryClient.setQueryData<TicketRecord[]>(ticketsListQueryKeyRef.current, (prev) => [
          newRecord,
          ...(prev ?? []),
        ])
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedAssignees([])
      setSelectedTagIds([])
      setNewTicketAttachments([])
      setDeletedTicketAttachmentIds([])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const handleModalCancel = async () => {
    if (newTicketAttachments.length > 0) {
      for (const a of newTicketAttachments) {
        if (a.file_path) await deleteFile(a.file_path)
      }
      setNewTicketAttachments([])
    }
    setDeletedTicketAttachmentIds([])
    setModalVisible(false)
    form.resetFields()
    setSelectedAssignees([])
    setSelectedTagIds([])
  }

  const handleRemoveNewAttachment = async (attachment: NewTicketAttachment) => {
    if (attachment.file_path) await deleteFile(attachment.file_path)
    setNewTicketAttachments((prev) => prev.filter((a) => a.url !== attachment.url))
  }

  return {
    collapsed,
    setCollapsed,
    tickets,
    loading,
    modalVisible,
    editingTicket,
    form,
    teams,
    users,
    selectedAssignees,
    setSelectedAssignees,
    selectedTagIds,
    setSelectedTagIds,
    ticketTypes,
    companies,
    allTags,
    allStatuses,
    allStatusColumns,
    statusColumns,
    activeId,
    columnsToShow,
    filteredTickets,
    filterStatus,
    setFilterStatus,
    filterTypeIds,
    setFilterTypeIds,
    filterCompanyIds,
    setFilterCompanyIds,
    filterTagIds,
    setFilterTagIds,
    filterTeamIds,
    setFilterTeamIds,
    filterDateRange,
    setFilterDateRange,
    filterDueDateRange,
    setFilterDueDateRange,
    filterSearch,
    setFilterSearch,
    commitSearch,
    searchFields,
    setSearchFields,
    filterSidebarCollapsed,
    setFilterSidebarCollapsed,
    viewMode,
    setViewMode,
    sortBy: TICKETS_LIST_SORT_BY,
    sortOrder: TICKETS_LIST_SORT_ORDER,
    hasActiveFilters,
    clearFilters,
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkMoveToTrash,
    handleBulkMoveToSpam,
    handleSubmit,
    handleModalCancel,
    handleDragStart,
    handleDragEnd,
    newTicketAttachments,
    setNewTicketAttachments,
    deletedTicketAttachmentIds,
    setDeletedTicketAttachmentIds,
    handleTicketFilesSelected,
    handleRemoveNewAttachment,
    attachmentUploading,
    userTeamIds,
    lookupReady,
    getFilterQueryString,
    filterTicketType,
    filterScope,
    filterByStatusFromChip,
    filterByTagFromChip,
    filterByCompanyFromChip,
    submitting,
    canDeleteTicket,
    ticketsPageLimit,
    setTicketsPageLimit,
    refetchTickets: () => queryClient.invalidateQueries({ queryKey: ticketsListQueryKeyRef.current }),
  }
}
