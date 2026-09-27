import { aiSettings, findOneBy } from '@/lib/fsdb'

export type AiChatProvider = 'openai' | 'codex'

export type AiChatConfig = {
  provider: AiChatProvider
  apiKey: string
  baseUrl: string
  model: string
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_CODEX_MODEL = 'gpt-5.4'

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function ensureOpenAiV1BaseUrl(url: string): string {
  const normalized = normalizeBaseUrl(url)
  if (!normalized) return ''
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
}

export function parseAiChatProvider(raw: string): AiChatProvider {
  const value = raw.trim().toLowerCase()
  if (value === 'codex') return 'codex'
  return 'openai'
}

/** Load the active AI config row from DB. Returns null if none is active. */
export async function getAiSettingsFromDb() {
  try {
    return await findOneBy(aiSettings, { isActive: true })
  } catch {
    return null
  }
}

/** Get AI chat config — active DB row takes priority over env vars. */
export async function getAiChatConfig(): Promise<AiChatConfig> {
  const dbRow = await getAiSettingsFromDb()

  const provider = parseAiChatProvider(
    dbRow?.provider || trimEnv('AI_PROVIDER') || 'openai'
  )

  if (provider === 'codex') {
    const apiKey = dbRow?.codexApiKey?.trim() || trimEnv('CODEX_API_KEY') || 'dummy'
    const rawBase = dbRow?.codexBaseUrl?.trim() || trimEnv('CODEX_BASE_URL') || ''
    const baseUrl = ensureOpenAiV1BaseUrl(rawBase)
    const model = dbRow?.codexModel?.trim() || trimEnv('CODEX_MODEL') || DEFAULT_CODEX_MODEL

    if (!baseUrl) throw new Error('Codex base URL is not configured')
    return { provider, apiKey, baseUrl, model }
  }

  const apiKey = dbRow?.openaiApiKey?.trim() || trimEnv('OPENAI_API_KEY')
  const rawBase = dbRow?.openaiBaseUrl?.trim() || trimEnv('OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL
  const baseUrl = ensureOpenAiV1BaseUrl(rawBase)
  const model = dbRow?.openaiModel?.trim() || trimEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL

  if (!apiKey) throw new Error('OpenAI API key is not configured')
  return { provider, apiKey, baseUrl, model }
}

export function isAiApiKeyConfigError(message: string): boolean {
  return (
    message.includes('OpenAI API key is not configured') ||
    message.includes('Codex base URL is not configured') ||
    message.includes('OPENAI_API_KEY is not configured') ||
    message.includes('CODEX_BASE_URL is not configured')
  )
}

export type AiChatPublicConfig = {
  provider: AiChatProvider
  providerLabel: string
  model: string
  baseUrl: string
  apiKeyConfigured: boolean
  configured: boolean
  configError?: string
  source: 'database' | 'env'
}

export function getAiProviderLabel(provider: AiChatProvider): string {
  return provider === 'codex' ? 'Codex (ChatGPT Pro)' : 'OpenAI Platform'
}

export async function getAiChatPublicConfig(): Promise<AiChatPublicConfig> {
  const dbRow = await getAiSettingsFromDb()
  const source: 'database' | 'env' = dbRow ? 'database' : 'env'

  const provider = parseAiChatProvider(
    dbRow?.provider || trimEnv('AI_PROVIDER') || 'openai'
  )

  if (provider === 'codex') {
    const rawBase = dbRow?.codexBaseUrl?.trim() || trimEnv('CODEX_BASE_URL') || ''
    const baseUrl = ensureOpenAiV1BaseUrl(rawBase)
    const model = dbRow?.codexModel?.trim() || trimEnv('CODEX_MODEL') || DEFAULT_CODEX_MODEL
    const apiKeyConfigured = !!(dbRow?.codexApiKey?.trim() || trimEnv('CODEX_API_KEY'))

    if (!baseUrl) {
      return {
        provider, providerLabel: getAiProviderLabel(provider),
        model, baseUrl: '', apiKeyConfigured: false, configured: false,
        configError: 'Codex base URL is not configured', source,
      }
    }
    return { provider, providerLabel: getAiProviderLabel(provider), model, baseUrl, apiKeyConfigured, configured: true, source }
  }

  const apiKey = dbRow?.openaiApiKey?.trim() || trimEnv('OPENAI_API_KEY')
  const rawBase = dbRow?.openaiBaseUrl?.trim() || trimEnv('OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL
  const baseUrl = ensureOpenAiV1BaseUrl(rawBase)
  const model = dbRow?.openaiModel?.trim() || trimEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL

  if (!apiKey) {
    return {
      provider, providerLabel: getAiProviderLabel(provider),
      model, baseUrl, apiKeyConfigured: false, configured: false,
      configError: 'OpenAI API key is not configured', source,
    }
  }
  return { provider, providerLabel: getAiProviderLabel(provider), model, baseUrl, apiKeyConfigured: true, configured: true, source }
}
