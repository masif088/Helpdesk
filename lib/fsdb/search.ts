/**
 * Keyword search for Firestore (no full-text search there).
 * Each searchable document stores an array of lowercase words plus their prefixes, so a query word
 * matches any stored word that starts with it: `array-contains` on one word, the rest checked in memory.
 */

const MIN_PREFIX = 2
const MAX_PREFIX = 20
const MAX_TOKENS = 2500

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
}

/** Lowercase words (letters/digits in any script). Emails are also kept whole. */
export function words(text: string | null | undefined): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const out = lower.match(/[\p{L}\p{N}]+/gu) ?? []
  const emails = lower.match(/[^\s<>()"',;]+@[^\s<>()"',;]+/g) ?? []
  return [...out, ...emails]
}

/** Words + prefixes for storing on a document. */
export function searchTokens(...texts: (string | null | undefined)[]): string[] {
  return searchTokensCapped(MAX_TOKENS, ...texts)
}

/** Same as `searchTokens` with an explicit cap (keeps large bodies from bloating documents). */
export function searchTokensCapped(maxTokens: number, ...texts: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const t of texts) {
    for (const w of words(t)) {
      if (set.size >= maxTokens) break
      set.add(w.slice(0, 64))
      const max = Math.min(w.length - 1, MAX_PREFIX)
      for (let i = MIN_PREFIX; i <= max; i++) set.add(w.slice(0, i))
    }
  }
  return [...set].slice(0, maxTokens)
}

/** Query words to look up (each capped to the stored prefix length). */
export function queryTokens(q: string | null | undefined): string[] {
  return [...new Set(words(q).map((w) => (w.length > MAX_PREFIX && !w.includes('@') ? w.slice(0, MAX_PREFIX) : w.slice(0, 64))))]
}

/** Pick the most selective token (longest) for the Firestore `array-contains` filter. */
export function bestToken(tokens: string[]): string | null {
  if (tokens.length === 0) return null
  return [...tokens].sort((a, b) => b.length - a.length)[0]
}

/** True when every query token is present in the document's keyword array. */
export function matchesAllTokens(docTokens: readonly string[] | null | undefined, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  if (!docTokens?.length) return false
  const set = new Set(docTokens)
  return tokens.every((t) => set.has(t))
}

/** Case-insensitive substring check used for small in-memory lists. */
export function containsText(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true
  return (haystack ?? '').toLowerCase().includes(needle.toLowerCase())
}
