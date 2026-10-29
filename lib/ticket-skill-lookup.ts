/** The skills each of many tickets needs: its own, else its client's for the type, else the defaults of its type and tags. */
import { companies, find, tags, type TicketsRow,ticketTags, ticketTypes } from '@/lib/fsdb'
import { resolveSkills } from '@/lib/ticket-skills'

export async function effectiveSkillsFor(rows: Pick<TicketsRow, 'id' | 'typeId' | 'companyId' | 'requiredSkills'>[]): Promise<Map<number, string[]>> {
  const [types, tagRows, links, companyRows] = await Promise.all([
    find(ticketTypes, { select: ['id', 'requiredSkills'] }),
    find(tags, { select: ['id', 'requiredSkills'] }),
    find(ticketTags, { select: ['ticketId', 'tagId'] }),
    find(companies, { select: ['id', 'skillsByType'] }),
  ])
  const clientSkills = new Map(companyRows.map((c) => [c.id, c.skillsByType ?? null]))
  const typeSkills = new Map(types.map((t) => [t.id, t.requiredSkills ?? []]))
  const tagSkills = new Map(tagRows.map((t) => [t.id, t.requiredSkills ?? []]))
  const tagsByTicket = new Map<number, string[][]>()
  for (const l of links) tagsByTicket.set(l.ticketId, [...(tagsByTicket.get(l.ticketId) ?? []), tagSkills.get(l.tagId) ?? []])

  return new Map(
    rows.map((t) => [
      t.id,
      resolveSkills({
        own: t.requiredSkills,
        clientByType: t.companyId ? clientSkills.get(t.companyId) : null,
        typeId: t.typeId,
        typeDefaults: t.typeId != null ? typeSkills.get(t.typeId) : null,
        tagDefaults: tagsByTicket.get(t.id) ?? [],
      }).skills,
    ])
  )
}
