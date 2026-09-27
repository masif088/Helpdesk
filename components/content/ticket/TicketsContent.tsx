'use client'

import { Alert, Layout, message, Spin } from 'antd'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import FilterSidebar, { FILTER_PANEL_WIDTH } from '@/components/ticket/list/FilterSidebar'
import TicketFormModal from '@/components/ticket/list/TicketFormModal'
import TicketsCardView from '@/components/ticket/list/TicketsCardView'
import TicketsHeader from '@/components/ticket/list/TicketsHeader'
import TicketsKanbanView from '@/components/ticket/list/TicketsKanbanView'
import TicketsListView from '@/components/ticket/list/TicketsListView'
import TicketsRoundRobinView from '@/components/ticket/list/TicketsRoundRobinView'
import { useTicketsData } from '@/components/ticket/list/useTicketsData'
import { canDeleteTickets } from '@/lib/auth-utils'
import { addSavedTicketFilterPreset } from '@/lib/ticket-saved-filters'

interface TicketsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

const TICKET_ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Ticket not found or has been removed.',
  no_access: 'You do not have permission to view that ticket.',
  invalid: 'That ticket link is not valid.',
}

export default function TicketsContent({ user: currentUser }: TicketsContentProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const ticketErrorHandledRef = useRef<string | null>(null)

  useEffect(() => {
    const err = searchParams.get('ticket_error')
    if (!err) {
      ticketErrorHandledRef.current = null
      return
    }
    if (ticketErrorHandledRef.current === err) return
    ticketErrorHandledRef.current = err

    message.open({
      key: 'ticket-detail-redirect',
      type: 'warning',
      content: TICKET_ERROR_MESSAGES[err] ?? 'Unable to open that ticket.',
      duration: 6,
    })

    const next = new URLSearchParams(searchParams.toString())
    next.delete('ticket_error')
    const q = next.toString()
    router.replace(q ? `/tickets?${q}` : '/tickets', { scroll: false })
  }, [searchParams, router])

  const isCustomer = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'customer'
  const canDeleteTicket = canDeleteTickets(currentUser.role)
  const {
    collapsed,
    setCollapsed,
    loading,
    modalVisible,
    editingTicket,
    form,
    teams,
    users,
    ticketTypes,
    companies,
    allTags,
    allStatuses,
    allStatusColumns,
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
    sortBy,
    sortOrder,
    selectedAssignees,
    setSelectedAssignees,
    selectedTagIds,
    setSelectedTagIds,
    newTicketAttachments,
    setNewTicketAttachments,
    deletedTicketAttachmentIds,
    setDeletedTicketAttachmentIds,
    handleTicketFilesSelected,
    handleRemoveNewAttachment,
    attachmentUploading,
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
    activeId,
    columnsToShow,
    lookupReady,
    getFilterQueryString,
    filterTicketType,
    filterScope,
    filterByStatusFromChip,
    filterByTagFromChip,
    filterByCompanyFromChip,
    submitting,
    ticketsPageLimit,
    setTicketsPageLimit,
    refetchTickets,
  } = useTicketsData(currentUser.id, isCustomer, canDeleteTicket)

  const handleCloseTicket = async (id: number) => {
    try {
      await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'closed' }),
      })
      refetchTickets()
    } catch {
      // silent
    }
  }

  useEffect(() => {
    const id = setInterval(() => { refetchTickets() }, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [refetchTickets])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn
        collapsed={collapsed}
        user={currentUser}
        style={{
          marginRight: filterSidebarCollapsed ? 0 : FILTER_PANEL_WIDTH + 12,
          transition: 'margin-left 0.2s, margin-right 0.2s',
          // borderRadius: '16px 0 0 16px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 0, minWidth: 0 }}>
          <TicketsHeader
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCreateClick={handleCreate}
            loading={loading}
            isCustomer={isCustomer}
            filterSearch={filterSearch}
            onFilterSearchChange={setFilterSearch}
            onCommitSearch={commitSearch}
            searchFields={searchFields}
            onSearchFieldsChange={setSearchFields}
            filterTicketType={filterTicketType}
            filterScope={filterScope}
            ticketsPageLimit={ticketsPageLimit}
            onTicketsPageLimitChange={setTicketsPageLimit}
            onRefresh={refetchTickets}
            filtersOpen={!filterSidebarCollapsed}
            onToggleFilters={() => setFilterSidebarCollapsed(!filterSidebarCollapsed)}
            hasActiveFilters={hasActiveFilters}
          />

          {!isCustomer && filterTicketType === 'notification' && (
            <Alert
              type="info"
              showIcon
              message="Notifications"
              description="Emails from automated contacts (bots / no-reply). Not part of the support queue — mark one as support if it needs work."
              style={{ marginLeft: '24px', marginRight: '48px', marginBottom: '12px' }}
            />
          )}
          {!isCustomer && filterTicketType === 'spam' && (
            <Alert
              type="warning"
              showIcon
              message="Spam tickets"
              description="Tickets marked as spam (card view). Use the sidebar to open All tickets or Trash."
              style={{ marginLeft: '24px', marginRight: '48px', marginBottom: '12px' }}
            />
          )}
          {!isCustomer && filterTicketType === 'trash' && (
            <Alert
              type="info"
              showIcon
              message="Trash tickets"
              description="Tickets moved to trash are kept here; use the sidebar to open All tickets or Spam."
              style={{ marginLeft: '24px', marginRight: '48px', marginBottom: '12px' }}
            />
          )}

          {loading || !lookupReady ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12 }}>Loading tasks...</div>
        </div>
          ) : viewMode === 'card' ? (
            <TicketsCardView
              tickets={filteredTickets}
              allStatusColumns={allStatusColumns}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canDeleteTicket={canDeleteTicket}
              isCustomer={isCustomer}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onFilterByStatus={filterByStatusFromChip}
              onFilterByTag={filterByTagFromChip}
              onFilterByCompany={filterByCompanyFromChip}
            />
          ) : viewMode === 'list' ? (
            <TicketsListView
              tickets={filteredTickets}
              allStatusColumns={allStatusColumns}
              isCustomer={isCustomer}
              filterTicketType={filterTicketType}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canDeleteTicket={canDeleteTicket}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onBulkMoveToSpam={!isCustomer ? handleBulkMoveToSpam : undefined}
              onBulkMoveToTrash={!isCustomer && canDeleteTicket ? handleBulkMoveToTrash : undefined}
              onFilterByStatus={filterByStatusFromChip}
              onFilterByTag={filterByTagFromChip}
              onFilterByCompany={filterByCompanyFromChip}
            />
          ) : viewMode === 'roundrobin' && !isCustomer ? (
            <TicketsRoundRobinView
              tickets={filteredTickets}
              statusColumns={allStatusColumns}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canDeleteTicket={canDeleteTicket}
            />
          ) : (
            <TicketsKanbanView
              tickets={filteredTickets}
              columnsToShow={columnsToShow}
              activeId={activeId}
              isCustomer={isCustomer}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCloseTicket={isCustomer ? handleCloseTicket : undefined}
              canDeleteTicket={canDeleteTicket}
              sortBy={sortBy}
              sortOrder={sortOrder}
              allStatusColumns={allStatusColumns}
              onFilterByStatus={filterByStatusFromChip}
              onFilterByTag={filterByTagFromChip}
              onFilterByCompany={filterByCompanyFromChip}
            />
          )}
        </div>
      </AdminMainColumn>

      <FilterSidebar
        collapsed={filterSidebarCollapsed}
        onCollapsedChange={setFilterSidebarCollapsed}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterTypeIds={filterTypeIds}
        onFilterTypeIdsChange={setFilterTypeIds}
        filterCompanyIds={filterCompanyIds}
        onFilterCompanyIdsChange={setFilterCompanyIds}
        filterTagIds={filterTagIds}
        onFilterTagIdsChange={setFilterTagIds}
        filterTeamIds={filterTeamIds}
        onFilterTeamIdsChange={setFilterTeamIds}
        filterDateRange={filterDateRange}
        onFilterDateRangeChange={setFilterDateRange}
        filterDueDateRange={filterDueDateRange}
        onFilterDueDateRangeChange={setFilterDueDateRange}
        filterSearch={filterSearch}
        onFilterSearchChange={setFilterSearch}
        allStatuses={allStatuses}
        ticketTypes={ticketTypes}
        teams={teams}
        companies={companies}
        allTags={allTags}
        hasActiveFilters={hasActiveFilters}
        filteredCount={filteredTickets.length}
        totalCount={filteredTickets.length}
        onClearFilters={clearFilters}
        isCustomer={isCustomer}
        onSaveViewPreset={(name) => addSavedTicketFilterPreset(currentUser.id, name, getFilterQueryString())}
      />

      <TicketFormModal
        open={modalVisible}
        editingTicket={editingTicket}
        form={form}
        teams={teams}
        users={users}
        ticketTypes={ticketTypes}
        companies={companies}
        allTags={allTags}
        allStatuses={allStatuses}
        selectedAssignees={selectedAssignees}
        onSelectedAssigneesChange={setSelectedAssignees}
        selectedTagIds={selectedTagIds}
        onSelectedTagIdsChange={setSelectedTagIds}
        ticketAttachmentsFromDb={editingTicket?.attachments ?? []}
        newTicketAttachments={newTicketAttachments}
        deletedTicketAttachmentIds={deletedTicketAttachmentIds}
        onDeletedAttachmentIdsChange={setDeletedTicketAttachmentIds}
        onNewAttachmentsChange={setNewTicketAttachments}
        onFilesSelected={handleTicketFilesSelected}
        onRemoveNewAttachment={handleRemoveNewAttachment}
        attachmentUploading={attachmentUploading}
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={handleModalCancel}
        isCustomer={isCustomer}
        onCloseTicket={isCustomer ? async (id) => { await handleCloseTicket(id); handleModalCancel() } : undefined}
      />
    </Layout>
  )
}
