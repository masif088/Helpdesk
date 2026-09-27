/**
 * App data layer on Firestore (replaces Postgres/Drizzle).
 *
 * Every former table is a top-level collection with the same snake_case name; documents keep the old
 * camelCase field names, so row objects look exactly like the Drizzle rows did.
 *
 *   import { tickets, get, find, insert, update } from '@/lib/fsdb'
 *   const t = await get(tickets, 42)
 *   const open = await find(tickets, { where: [['status', '==', 'open']], orderBy: [['createdAt', 'desc']], limit: 20 })
 */
import * as S from './schema'
import { searchTokens, searchTokensCapped, stripHtml } from './search'

// Derived (stored, not part of the row type) fields used for case-insensitive lookups and keyword search.
Object.assign(S.users, {
  derive: (r: S.UsersRow) => ({
    emailLower: (r.email ?? '').trim().toLowerCase(),
    searchKeywords: searchTokens(r.fullName, r.firstName, r.lastName, r.email),
  }),
})
Object.assign(S.companies, {
  derive: (r: S.CompaniesRow) => ({
    emailLower: (r.email ?? '').trim().toLowerCase() || null,
    searchKeywords: searchTokens(r.name, r.email),
  }),
})
Object.assign(S.emailSkipList, {
  derive: (r: S.EmailSkipListRow) => ({ emailLower: (r.email ?? '').trim().toLowerCase() }),
})
Object.assign(S.tickets, {
  derive: (r: S.TicketsRow) => ({
    kwTitle: searchTokens(r.title, r.id != null ? String(r.id) : null),
    kwDescription: searchTokensCapped(800, stripHtml(r.description)),
  }),
})
Object.assign(S.ticketComments, {
  derive: (r: S.TicketCommentsRow) => ({
    kwComment: searchTokensCapped(800, stripHtml(r.comment)),
  }),
})

export * from './cascade'
export * from './firestore'
export * from './ops'
export * from './schema'
export * from './search'
export type { AnyTable, InsertOf, RowOf, Table } from './table'
export { docIdFor } from './table'
