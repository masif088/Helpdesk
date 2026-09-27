'use client'

import { ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, GlobalOutlined,ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Layout, message, Progress, Select,Space, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import { getCrawlPages } from '@/app/actions/crawl'
import DateDisplay from '@/components/common/DateDisplay'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

interface CrawlSessionDetailContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  crawlSession: any
}

interface CrawlPageRecord {
  id: string
  crawl_session_id: string
  url: string
  title: string | null
  description: string | null
  depth: number
  status: string
  http_status_code: number | null
  content_type: string | null
  heading_hierarchy: any
  meta_tags: any
  links: string[] | null
  error_message: string | null
  crawled_at: string | null
  created_at: string
  updated_at: string
}

/** Ant Design semantic tokens — work in light/dark via ConfigProvider. Replaces fixed #fff / #fafafa blocks. */
const crawlUi = {
  bg: 'var(--ant-color-bg-container, #ffffff)',
  fillTertiary: 'var(--ant-color-fill-tertiary, #f5f5f5)',
  fillSecondary: 'var(--ant-color-fill-secondary, #fafafa)',
  border: 'var(--ant-color-border-secondary, #f0f0f0)',
  split: 'var(--ant-color-split, rgba(5, 5, 5, 0.06))',
  text: 'var(--ant-color-text, rgba(0, 0, 0, 0.88))',
  textSecondary: 'var(--ant-color-text-secondary, rgba(0, 0, 0, 0.65))',
  textTertiary: 'var(--ant-color-text-tertiary, rgba(0, 0, 0, 0.45))',
  errorBg: 'var(--ant-color-error-bg, #fff2f0)',
  warningBg: 'var(--ant-color-warning-bg, #fffbe6)',
  successBg: 'var(--ant-color-success-bg, #f6ffed)',
  errBorderSolid: '1px solid var(--ant-color-error-border, #ffccc7)',
  warnBorderSolid: '1px solid var(--ant-color-warning-border, #ffe58f)',
  successBorderSolid: '1px solid var(--ant-color-success-border, #b7eb8f)',
  neutralBorderSolid: `1px solid var(--ant-color-border-secondary, #f0f0f0)`,
  primary: 'var(--ant-color-primary, #1677ff)',
} as const

export default function CrawlSessionDetailContent({ user: currentUser, crawlSession }: CrawlSessionDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [crawlPages, setCrawlPages] = useState<CrawlPageRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [mainPagePreview, setMainPagePreview] = useState<CrawlPageRecord | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const getHeadingColor = (level: number) => {
    const colors: { [key: number]: string } = {
      1: 'red',
      2: 'orange',
      3: 'gold',
      4: 'cyan',
      5: 'blue',
      6: 'purple',
    }
    return colors[level] || 'default'
  }

  // Required meta tags array
  const REQUIRED_META_TAGS = [
    'description',
    'keywords',
    'og:title',
    'og:description',
    'og:image',
    'og:url',
    'og:type',
    'twitter:card',
    'twitter:title',
    'twitter:description',
    'twitter:image',
    'robots',
    'viewport',
  ]

  // SEO Length Constraints
  const SEO_LENGTHS = {
    title: {
      min: 30,
      max: 60,
      recommended: { min: 50, max: 60 },
    },
    description: {
      min: 120,
      max: 160,
      recommended: { min: 150, max: 160 },
    },
    ogTitle: {
      min: 40,
      max: 95,
      recommended: { min: 60, max: 95 },
    },
    ogDescription: {
      min: 120,
      max: 200,
      recommended: { min: 150, max: 200 },
    },
    twitterTitle: {
      min: 40,
      max: 70,
      recommended: { min: 55, max: 70 },
    },
    twitterDescription: {
      min: 120,
      max: 200,
      recommended: { min: 150, max: 200 },
    },
  }

  // Analyze title and description lengths
  const analyzeSEOLengths = (record: CrawlPageRecord) => {
    const metaTags = record.meta_tags || {}
    const analyses: Array<{
      type: string
      label: string
      value: string
      length: number
      min: number
      max: number
      status: 'good' | 'warning' | 'error'
      message: string
    }> = []

    // Title analysis
    const title = record.title || ''
    if (title) {
      const length = title.length
      let status: 'good' | 'warning' | 'error' = 'good'
      let message = 'Good length'
      
      if (length < SEO_LENGTHS.title.min) {
        status = 'error'
        message = `Too short (${length}/${SEO_LENGTHS.title.max} chars)`
      } else if (length > SEO_LENGTHS.title.max) {
        status = 'error'
        message = `Too long (${length}/${SEO_LENGTHS.title.max} chars)`
      } else if (length < SEO_LENGTHS.title.recommended.min) {
        status = 'warning'
        message = `Below recommended (${length}/${SEO_LENGTHS.title.max} chars)`
      } else if (length > SEO_LENGTHS.title.recommended.max) {
        status = 'warning'
        message = `Above recommended`
      }

      analyses.push({
        type: 'title',
        label: 'Page Title',
        value: title,
        length,
        min: SEO_LENGTHS.title.min,
        max: SEO_LENGTHS.title.max,
        status,
        message,
      })
    }

    // Description analysis
    const description = record.description || ''
    if (description) {
      const length = description.length
      let status: 'good' | 'warning' | 'error' = 'good'
      let message = 'Good length'
      
      if (length < SEO_LENGTHS.description.min) {
        status = 'error'
        message = `Too short (${length}/${SEO_LENGTHS.description.max} chars)`
      } else if (length > SEO_LENGTHS.description.max) {
        status = 'error'
        message = `Too long (${length}/${SEO_LENGTHS.description.max} chars)`
      } else if (length < SEO_LENGTHS.description.recommended.min) {
        status = 'warning'
        message = `Below recommended (${length}/${SEO_LENGTHS.description.max} chars)`
      }

      analyses.push({
        type: 'description',
        label: 'Meta Description',
        value: description,
        length,
        min: SEO_LENGTHS.description.min,
        max: SEO_LENGTHS.description.max,
        status,
        message,
      })
    }

    // OG Title analysis
    const ogTitle = metaTags['og:title'] || ''
    if (ogTitle) {
      const length = ogTitle.length
      let status: 'good' | 'warning' | 'error' = 'good'
      let message = 'Good length'
      
      if (length < SEO_LENGTHS.ogTitle.min) {
        status = 'error'
        message = `Too short (${length}/${SEO_LENGTHS.ogTitle.max} chars)`
      } else if (length > SEO_LENGTHS.ogTitle.max) {
        status = 'error'
        message = `Too long (${length}/${SEO_LENGTHS.ogTitle.max} chars)`
      } else if (length < SEO_LENGTHS.ogTitle.recommended.min) {
        status = 'warning'
        message = `Below recommended (${length}/${SEO_LENGTHS.ogTitle.max} chars)`
      }

      analyses.push({
        type: 'ogTitle',
        label: 'OG Title',
        value: ogTitle,
        length,
        min: SEO_LENGTHS.ogTitle.min,
        max: SEO_LENGTHS.ogTitle.max,
        status,
        message,
      })
    }

    // OG Description analysis
    const ogDescription = metaTags['og:description'] || ''
    if (ogDescription) {
      const length = ogDescription.length
      let status: 'good' | 'warning' | 'error' = 'good'
      let message = 'Good length'
      
      if (length < SEO_LENGTHS.ogDescription.min) {
        status = 'error'
        message = `Too short (${length}/${SEO_LENGTHS.ogDescription.max} chars)`
      } else if (length > SEO_LENGTHS.ogDescription.max) {
        status = 'error'
        message = `Too long (${length}/${SEO_LENGTHS.ogDescription.max} chars)`
      } else if (length < SEO_LENGTHS.ogDescription.recommended.min) {
        status = 'warning'
        message = `Below recommended (${length}/${SEO_LENGTHS.ogDescription.max} chars)`
      }

      analyses.push({
        type: 'ogDescription',
        label: 'OG Description',
        value: ogDescription,
        length,
        min: SEO_LENGTHS.ogDescription.min,
        max: SEO_LENGTHS.ogDescription.max,
        status,
        message,
      })
    }

    // Twitter Title analysis
    const twitterTitle = metaTags['twitter:title'] || ''
    if (twitterTitle) {
      const length = twitterTitle.length
      let status: 'good' | 'warning' | 'error' = 'good'
      let message = 'Good length'
      
      if (length < SEO_LENGTHS.twitterTitle.min) {
        status = 'error'
        message = `Too short (${length}/${SEO_LENGTHS.twitterTitle.max} chars). Minimum: ${SEO_LENGTHS.twitterTitle.min} chars`
      } else if (length > SEO_LENGTHS.twitterTitle.max) {
        status = 'error'
        message = `Too long (${length}/${SEO_LENGTHS.twitterTitle.max} chars). Maximum: ${SEO_LENGTHS.twitterTitle.max} chars`
      } else if (length < SEO_LENGTHS.twitterTitle.recommended.min) {
        status = 'warning'
        message = `Below recommended (${length}/${SEO_LENGTHS.twitterTitle.max} chars). Recommended: ${SEO_LENGTHS.twitterTitle.recommended.min}-${SEO_LENGTHS.twitterTitle.recommended.max} chars`
      }

      analyses.push({
        type: 'twitterTitle',
        label: 'Twitter Title',
        value: twitterTitle,
        length,
        min: SEO_LENGTHS.twitterTitle.min,
        max: SEO_LENGTHS.twitterTitle.max,
        status,
        message,
      })
    }

    // Twitter Description analysis
    const twitterDescription = metaTags['twitter:description'] || ''
    if (twitterDescription) {
      const length = twitterDescription.length
      let status: 'good' | 'warning' | 'error' = 'good'
      let message = 'Good length'
      
      if (length < SEO_LENGTHS.twitterDescription.min) {
        status = 'error'
        message = `Too short (${length}/${SEO_LENGTHS.twitterDescription.max} chars). Minimum: ${SEO_LENGTHS.twitterDescription.min} chars`
      } else if (length > SEO_LENGTHS.twitterDescription.max) {
        status = 'error'
        message = `Too long (${length}/${SEO_LENGTHS.twitterDescription.max} chars). Maximum: ${SEO_LENGTHS.twitterDescription.max} chars`
      } else if (length < SEO_LENGTHS.twitterDescription.recommended.min) {
        status = 'warning'
        message = `Below recommended (${length}/${SEO_LENGTHS.twitterDescription.max} chars). Recommended: ${SEO_LENGTHS.twitterDescription.recommended.min}-${SEO_LENGTHS.twitterDescription.recommended.max} chars`
      }

      analyses.push({
        type: 'twitterDescription',
        label: 'Twitter Description',
        value: twitterDescription,
        length,
        min: SEO_LENGTHS.twitterDescription.min,
        max: SEO_LENGTHS.twitterDescription.max,
        status,
        message,
      })
    }

    return analyses
  }

  // Render SEO length analysis
  const renderSEOLengthAnalysis = (record: CrawlPageRecord) => {
    const analyses = analyzeSEOLengths(record)
    
    if (analyses.length === 0) {
      return null
    }

    return (
      <div>
        <Text strong style={{ fontSize: 16, marginBottom: 16, display: 'block' }}>
          SEO Length Analysis:
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          {analyses.map((analysis) => {
            const getStatusColor = () => {
              switch (analysis.status) {
                case 'error':
                  return 'red'
                case 'warning':
                  return 'orange'
                default:
                  return 'green'
              }
            }

            const getProgressColor = () => {
              const percentage = (analysis.length / analysis.max) * 100
              if (percentage < 50) return '#ff4d4f'
              if (percentage > 100) return '#ff4d4f'
              if (percentage < 80) return '#faad14'
              return '#52c41a'
            }

            return (
              <div
                key={analysis.type}
                style={{
                  padding: '12px',
                  background:
                    analysis.status === 'error'
                      ? crawlUi.errorBg
                      : analysis.status === 'warning'
                        ? crawlUi.warningBg
                        : crawlUi.successBg,
                  borderRadius: 4,
                  border:
                    analysis.status === 'error'
                      ? crawlUi.errBorderSolid
                      : analysis.status === 'warning'
                        ? crawlUi.warnBorderSolid
                        : crawlUi.successBorderSolid,
                }}
              >
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>{analysis.label}</Text>
                  <Tag color={getStatusColor()}>
                    {analysis.status === 'error' ? 'Error' : analysis.status === 'warning' ? 'Warning' : 'Good'}
                  </Tag>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: crawlUi.textSecondary }}>
                      Length: <strong style={{ color: getProgressColor() }}>{analysis.length}</strong> / {analysis.max} chars
                    </Text>
                    <Text style={{ fontSize: 12, color: crawlUi.textSecondary }}>
                      Min: {analysis.min} | Max: {analysis.max}
                    </Text>
                  </div>
                  <Progress
                    percent={(analysis.length / analysis.max) * 100}
                    strokeColor={getProgressColor()}
                    showInfo={false}
                    style={{ marginBottom: 4 }}
                  />
                </div>
                <div
                  style={{
                    marginBottom: 8,
                    padding: '8px',
                    background: crawlUi.bg,
                    borderRadius: 4,
                    border: crawlUi.neutralBorderSolid,
                  }}
                >
                  <Text style={{ fontSize: 13, wordBreak: 'break-word' }}>{analysis.value}</Text>
                </div>
                <Text
                  style={{
                    fontSize: 12,
                    color: analysis.status === 'error' ? '#ff4d4f' : analysis.status === 'warning' ? '#faad14' : '#52c41a',
                  }}
                >
                  {analysis.message}
                </Text>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Group meta tags by category
  const groupMetaTags = (metaTags: any) => {
    const groups: {
      twitter: Array<{ key: string; value: string }>
      facebook: Array<{ key: string; value: string }>
      schema: Array<{ key: string; value: string }>
      general: Array<{ key: string; value: string }>
    } = {
      twitter: [],
      facebook: [],
      schema: [],
      general: [],
    }

    Object.entries(metaTags).forEach(([key, value]) => {
      const tag = { key, value: String(value) }
      
      if (key.startsWith('twitter:')) {
        groups.twitter.push(tag)
      } else if (key.startsWith('og:') || key.startsWith('fb:')) {
        groups.facebook.push(tag)
      } else if (key.startsWith('schema:') || key.includes('schema.org') || key.startsWith('item')) {
        groups.schema.push(tag)
      } else {
        groups.general.push(tag)
      }
    })

    return groups
  }

  // Render meta tags with missing required tags highlighted
  const renderMetaTags = (metaTags: any) => {
    if (!metaTags || typeof metaTags !== 'object' || Object.keys(metaTags).length === 0) {
      return (
        <div style={{ padding: '12px', background: crawlUi.errorBg, borderRadius: 4, border: crawlUi.errBorderSolid }}>
          <Text type="danger">No meta tags found</Text>
        </div>
      )
    }

    const metaKeys = Object.keys(metaTags)
    const missingRequired = REQUIRED_META_TAGS.filter(tag => !metaKeys.includes(tag))
    const groupedTags = groupMetaTags(metaTags)

    const renderTagGroup = (
      title: string,
      tags: Array<{ key: string; value: string }>,
      color: string,
      icon?: string
    ) => {
      if (tags.length === 0) return null

      return (
        <div key={title} style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
            <Text strong style={{ fontSize: 16 }}>
              {title}
            </Text>
            <Tag color={color} style={{ fontSize: 11 }}>
              {tags.length} tags
            </Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {tags.map(({ key, value }) => {
              const isRequired = REQUIRED_META_TAGS.includes(key)
              const isEmpty = !value || value.trim() === ''
              
              return (
                <div
                  key={key}
                  style={{
                    padding: '12px',
                    background: isEmpty && isRequired ? crawlUi.errorBg : crawlUi.fillSecondary,
                    borderRadius: 4,
                    border: isEmpty && isRequired ? crawlUi.errBorderSolid : crawlUi.neutralBorderSolid,
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <Tag color={isRequired ? (isEmpty ? 'red' : 'green') : 'default'}>
                      {isRequired ? 'Required' : 'Optional'}
                    </Tag>
                    <Text strong style={{ color: isEmpty && isRequired ? '#ff4d4f' : undefined }}>
                      {key}
                    </Text>
                  </div>
                  <Text
                    style={{
                      color: isEmpty && isRequired ? '#ff4d4f' : crawlUi.textSecondary,
                      fontSize: 13,
                      wordBreak: 'break-word',
                    }}
                  >
                    {isEmpty ? '(empty)' : value}
                  </Text>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div>
        {missingRequired.length > 0 && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: crawlUi.errorBg,
              borderRadius: 4,
              border: crawlUi.errBorderSolid,
            }}
          >
            <Text strong style={{ color: '#ff4d4f' }}>Missing Required Meta Tags ({missingRequired.length}):</Text>
            <div style={{ marginTop: 8 }}>
              {missingRequired.map((tag) => (
                <Tag key={tag} color="red" style={{ marginBottom: 4 }}>
                  {tag}
                </Tag>
              ))}
            </div>
          </div>
        )}
        
        {renderTagGroup('Twitter Cards', groupedTags.twitter, 'default', '🐦')}
        {renderTagGroup('Facebook / Open Graph', groupedTags.facebook, 'blue', '📘')}
        {renderTagGroup('Schema.org', groupedTags.schema, 'purple', '📊')}
        {renderTagGroup('General', groupedTags.general, 'default', '📄')}
      </div>
    )
  }

  // Render social media previews (Facebook, Twitter/X, Slack, WhatsApp)
  const renderSocialPreviews = (record: CrawlPageRecord | null = null, customMetaTags: any = null, customUrl: string = '') => {
    const metaTags = customMetaTags || record?.meta_tags || {}
    const url = customUrl || record?.url || ''
    const title = metaTags['og:title'] || metaTags['twitter:title'] || record?.title || 'No Title'
    const description = metaTags['og:description'] || metaTags['twitter:description'] || record?.description || 'No description available'
    const image = metaTags['og:image'] || metaTags['twitter:image'] || ''
    const hasImage = image && image.trim() !== ''
    
    let domain = 'example.com'
    let siteName = metaTags['og:site_name'] || domain
    try {
      if (url) {
        const urlObj = new URL(url)
        domain = urlObj.hostname
        siteName = metaTags['og:site_name'] || domain
      }
    } catch (e) {
      // If URL parsing fails, use default
      console.error('Error parsing URL:', e)
    }

    return (
      <div>
        <Text strong style={{ fontSize: 16, marginBottom: 16, display: 'block' }}>
          Social Media Share Preview:
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {/* Facebook Preview */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
                Facebook
              </Tag>
            </div>
            <div
              style={{
                border: crawlUi.neutralBorderSolid,
                borderRadius: 8,
                overflow: 'hidden',
                background: crawlUi.bg,
                maxWidth: 500,
              }}
            >
              {hasImage ? (
                <div
                  style={{
                    width: '100%',
                    height: 262,
                    backgroundColor: crawlUi.fillTertiary,
                    backgroundImage: `url(${image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderBottom: crawlUi.neutralBorderSolid,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: 262,
                    background: crawlUi.fillTertiary,
                    borderBottom: crawlUi.neutralBorderSolid,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: crawlUi.textTertiary,
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>No Image Available</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>og:image or twitter:image missing</div>
                </div>
              )}
              <div style={{ padding: '12px' }}>
                <div
                  style={{
                    fontSize: 12,
                    color: crawlUi.textSecondary,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {domain}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: crawlUi.text,
                    marginBottom: 4,
                    lineHeight: '20px',
                  }}
                >
                  {title}
                </div>
                <div style={{ fontSize: 14, color: crawlUi.textSecondary, lineHeight: '20px' }}>
                  {description.length > 100 ? `${description.substring(0, 100)}...` : description}
                </div>
              </div>
            </div>
          </div>

          {/* Twitter/X Preview */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Tag color="default" style={{ fontSize: 12, padding: '2px 8px' }}>
                Twitter / X
              </Tag>
            </div>
            <div
              style={{
                border: crawlUi.neutralBorderSolid,
                borderRadius: 12,
                overflow: 'hidden',
                background: crawlUi.bg,
                maxWidth: 500,
              }}
            >
              {hasImage ? (
                <div
                  style={{
                    width: '100%',
                    height: 262,
                    backgroundColor: crawlUi.fillTertiary,
                    backgroundImage: `url(${image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderBottom: crawlUi.neutralBorderSolid,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: 262,
                    background: crawlUi.fillTertiary,
                    borderBottom: crawlUi.neutralBorderSolid,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: crawlUi.textSecondary,
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>No Image Available</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>og:image or twitter:image missing</div>
                </div>
              )}
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: 15, fontWeight: 400, color: crawlUi.text, marginBottom: 2, lineHeight: '20px' }}>
                  {title}
                </div>
                <div style={{ fontSize: 15, color: crawlUi.textSecondary, marginBottom: 2, lineHeight: '20px' }}>
                  {description.length > 100 ? `${description.substring(0, 100)}...` : description}
                </div>
                <div style={{ fontSize: 13, color: crawlUi.textSecondary, marginTop: 4 }}>{domain}</div>
              </div>
            </div>
          </div>

          {/* Slack Preview */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Tag color="purple" style={{ fontSize: 12, padding: '2px 8px' }}>
                Slack
              </Tag>
            </div>
            <div
              style={{
                border: crawlUi.neutralBorderSolid,
                borderRadius: 4,
                overflow: 'hidden',
                background: crawlUi.bg,
                maxWidth: 500,
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                {hasImage ? (
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      backgroundColor: crawlUi.fillTertiary,
                      backgroundImage: `url(${image})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      background: crawlUi.fillTertiary,
                      borderRadius: 4,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: crawlUi.textTertiary,
                      fontSize: 24,
                    }}
                  >
                    🖼️
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: crawlUi.primary, marginBottom: 4, lineHeight: '18px' }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: 13, color: crawlUi.textSecondary, marginBottom: 4, lineHeight: '18px' }}>
                    {description.length > 120 ? `${description.substring(0, 120)}...` : description}
                  </div>
                  <div style={{ fontSize: 12, color: crawlUi.textSecondary }}>{domain}</div>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Preview */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>
                WhatsApp
              </Tag>
            </div>
            <div
              style={{
                border: crawlUi.neutralBorderSolid,
                borderRadius: 4,
                overflow: 'hidden',
                background: crawlUi.bg,
                maxWidth: 500,
              }}
            >
              {hasImage ? (
                <div
                  style={{
                    width: '100%',
                    height: 200,
                    backgroundColor: crawlUi.fillTertiary,
                    backgroundImage: `url(${image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderBottom: crawlUi.neutralBorderSolid,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: 200,
                    background: crawlUi.fillTertiary,
                    borderBottom: crawlUi.neutralBorderSolid,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: crawlUi.textTertiary,
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>No Image Available</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>og:image or twitter:image missing</div>
                </div>
              )}
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: crawlUi.text, marginBottom: 4, lineHeight: '20px' }}>
                  {title}
                </div>
                <div style={{ fontSize: 13, color: crawlUi.textSecondary, marginBottom: 4, lineHeight: '18px' }}>
                  {description.length > 100 ? `${description.substring(0, 100)}...` : description}
                </div>
                <div
                  style={{ fontSize: 12, color: crawlUi.textTertiary, textTransform: 'uppercase' }}
                >
                  {domain}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Flatten heading hierarchy in order to detect skipped levels
  const flattenHeadingsInOrder = (hierarchy: any, result: Array<{ title: string; level: number; node: any; path: string[] }> = [], path: string[] = []): Array<{ title: string; level: number; node: any; path: string[] }> => {
    if (!hierarchy || typeof hierarchy !== 'object') {
      return result
    }

    Object.entries(hierarchy).forEach(([title, node]: [string, any]) => {
      if (node && typeof node === 'object') {
        const level = parseInt((node.level || 'h1').replace('h', ''))
        const currentPath = [...path, title]
        result.push({ title, level, node, path: currentPath })
        
        if (node.child && Object.keys(node.child).length > 0) {
          flattenHeadingsInOrder(node.child, result, currentPath)
        }
      }
    })

    return result
  }

  // Check if a heading level is skipped compared to previous heading
  const isHeadingSkipped = (currentLevel: number, previousLevel: number): boolean => {
    if (previousLevel === 0) return false // First heading can't be skipped
    return currentLevel > previousLevel + 1
  }

  // Create a map of skipped headings based on their path
  const getSkippedHeadingsMap = (hierarchy: any): Set<string> => {
    const flatHeadings = flattenHeadingsInOrder(hierarchy)
    const skippedPaths = new Set<string>()
    let previousLevel = 0

    flatHeadings.forEach((heading, index) => {
      if (index > 0 && isHeadingSkipped(heading.level, previousLevel)) {
        // Mark this heading as skipped
        skippedPaths.add(heading.path.join('|'))
      }
      previousLevel = heading.level
    })

    return skippedPaths
  }

  const renderHeadingHierarchy = (hierarchy: any, depth: number = 0, skippedPaths: Set<string> = new Set(), currentPath: string[] = []) => {
    if (!hierarchy || typeof hierarchy !== 'object') {
      return null
    }

    // Get skipped headings map if not provided
    if (depth === 0) {
      skippedPaths = getSkippedHeadingsMap(hierarchy)
    }

    const elements = Object.entries(hierarchy)
      .map(([title, node]: [string, any]) => {
        if (!node || typeof node !== 'object') {
          return null
        }

        const level = node.level || 'h1'
        const levelNum = parseInt(level.replace('h', ''))
        const indent = depth * 24
        const hasChildren = node.child && Object.keys(node.child).length > 0
        const headingPath = [...currentPath, title]
        const pathKey = headingPath.join('|')
        const skipped = skippedPaths.has(pathKey)

        return (
          <div key={`${title}-${depth}`} style={{ marginBottom: hasChildren ? 0 : 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                paddingLeft: `${indent}px`,
                borderLeft: indent > 0 ? `2px solid ${getHeadingColor(levelNum)}` : 'none',
                marginBottom: hasChildren ? 4 : 8,
              }}
            >
              <Tag
                color={skipped ? 'red' : getHeadingColor(levelNum)}
                style={{
                  marginRight: 8,
                  minWidth: 32,
                  textAlign: 'center',
                  fontWeight: 'bold',
                  flexShrink: 0,
                }}
              >
                {level.toUpperCase()}
              </Tag>
              <Text 
                style={{ 
                  flex: 1, 
                  lineHeight: '22px', 
                  fontWeight: hasChildren ? 600 : 400,
                  color: skipped ? '#ff4d4f' : undefined
                }}
              >
                {title}
                {skipped && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#ff4d4f' }}>
                    (Warning: Heading level is skipped)
                  </span>
                )}
              </Text>
            </div>
            {hasChildren && (
              <div style={{ marginLeft: indent + 40 }}>
                {renderHeadingHierarchy(node.child, depth + 1, skippedPaths, headingPath)}
              </div>
            )}
          </div>
        )
      })
      .filter((item) => item !== null)

    return elements.length > 0 ? <>{elements}</> : null
  }

  useEffect(() => {
    fetchCrawlPages()
    // Set up polling if session is still crawling
    if (crawlSession.status === 'crawling' || crawlSession.status === 'pending') {
      const interval = setInterval(() => {
        fetchCrawlPages()
        // Refresh session data
        fetchSessionData()
      }, 5000) // Poll every 5 seconds

      return () => clearInterval(interval)
    }
  }, [crawlSession.id])

  const fetchSessionData = async () => {
    try {
      const res = await fetch(`/api/crawl-sessions/${crawlSession.id}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data.status !== crawlSession.status) {
          router.refresh()
        }
      }
    } catch (error) {
      console.error('Error fetching session data:', error)
    }
  }

  const fetchCrawlPages = async () => {
    setLoading(true)
    try {
      const result = await getCrawlPages(crawlSession.id)

      if (result.error) {
        message.error(result.error)
      } else {
        const pages = (result.data || []) as CrawlPageRecord[]
        setCrawlPages(pages)
        
        // Find main page (depth 0 or URL matching company website URL)
        const websiteUrl = crawlSession.company_websites?.url
        const mainPage = pages.find((page: CrawlPageRecord) => 
          page.depth === 0 || (websiteUrl && page.url === websiteUrl)
        ) || pages[0] || null
        setMainPagePreview(mainPage)
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch crawl pages')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'crawling':
        return 'blue'
      case 'failed':
        return 'red'
      case 'broken-page':
        return 'orange' // Orange for broken pages (HTTP error status codes)
      case 'pending':
        return 'orange'
      case 'uncrawl-page':
        return 'geekblue' // Cyan/blue: not an error, but uncrawlable (non-HTML, etc.)
      default:
        return 'default'
    }
  }

  const getProgress = () => {
    const total = crawlSession.total_pages || 0
    const crawled = crawlSession.crawled_pages || 0
    if (total === 0) return 0
    return Math.round((crawled / total) * 100)
  }

  // Collect all warnings for a page
  const getWarnings = (record: CrawlPageRecord): string[] => {
    const warnings: string[] = []

    // Check SEO length warnings
    if (record.status === 'completed') {
      const analyses = analyzeSEOLengths(record)
      analyses.forEach(analysis => {
        if (analysis.status === 'warning') {
          // Simple warning message in English
          warnings.push(`${analysis.label} does not meet recommendation`)
        }
      })
    }

    // Check heading hierarchy warnings (skipped levels)
    if (record.heading_hierarchy && typeof record.heading_hierarchy === 'object') {
      const skippedHeadings = getSkippedHeadingsMap(record.heading_hierarchy)
      if (skippedHeadings.size > 0) {
        warnings.push(`Skipped heading levels detected`)
      }
    }

    // Check missing required meta tags
    if (record.meta_tags && typeof record.meta_tags === 'object') {
      const missingTags = REQUIRED_META_TAGS.filter(tag => !record.meta_tags[tag])
      if (missingTags.length > 0) {
        warnings.push(`Missing required meta tags`)
      }
    }

    return warnings
  }

  // Filter crawl pages based on status
  const filteredCrawlPages = statusFilter === 'all' 
    ? crawlPages 
    : crawlPages.filter(page => page.status === statusFilter)

  // Get unique statuses from crawl pages for filter options
  const availableStatuses: string[] = Array.from(new Set(crawlPages.map(page => page.status))).sort()

  const columns: ColumnsType<CrawlPageRecord> = [
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string, record: CrawlPageRecord) => (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          style={(record.status === 'failed' || record.status === 'broken-page') ? { color: '#ff4d4f', fontWeight: 500 } : {}}
        >
          {url}
        </a>
      ),
      ellipsis: true,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Depth',
      dataIndex: 'depth',
      key: 'depth',
      width: 80,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)} style={{ textTransform: 'uppercase' }}>
          {status}
        </Tag>
      ),
      width: 120,
    },
    {
      title: 'HTTP Status',
      dataIndex: 'http_status_code',
      key: 'http_status_code',
      render: (code: number | null) => code ? (
        <Tag color={code >= 200 && code < 300 ? 'green' : code >= 300 && code < 400 ? 'orange' : 'red'}>
          {code}
        </Tag>
      ) : '-',
      width: 120,
    },
    {
      title: 'Crawled At',
      key: 'crawled_at',
      render: (_, record) => record.crawled_at ? <DateDisplay date={record.crawled_at} /> : '-',
    },
    {
      title: 'Messages',
      key: 'messages',
      render: (_, record: CrawlPageRecord) => {
        const warnings = getWarnings(record)
        const errorMessage = (record.status === 'failed' || record.status === 'broken-page') ? record.error_message : null
        const hasContent = warnings.length > 0 || errorMessage

        if (!hasContent) {
          return '-'
        }

        return (
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            {warnings.map((warning, index) => (
              <Tag key={`warning-${index}`} color="orange" style={{ fontSize: 11, margin: 0, display: 'block' }}>
                {warning}
              </Tag>
            ))}
            {errorMessage && (
              <Text type="danger" style={{ fontSize: 12, display: 'block' }}>
                {errorMessage}
              </Text>
            )}
          </Space>
        )
      },
      ellipsis: true,
      width: 350,
    },
  ]

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <>
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Company">
              {crawlSession.company_websites?.companies?.name || 'N/A'}
            </Descriptions.Item>
            <Descriptions.Item label="Website URL">
              <a href={crawlSession.company_websites?.url} target="_blank" rel="noopener noreferrer">
                {crawlSession.company_websites?.url}
              </a>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={getStatusColor(crawlSession.status)} style={{ textTransform: 'uppercase', fontSize: 14, padding: '4px 12px' }}>
                {crawlSession.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Progress">
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                <Progress 
                  percent={getProgress()} 
                  status={crawlSession.status === 'crawling' ? 'active' : crawlSession.status === 'completed' ? 'success' : 'normal'}
                  size="small"
                />
                <Space wrap>
                  <Tag color="green">
                    <CheckCircleOutlined /> Crawled: <strong>{crawlSession.crawled_pages || 0}</strong>
                  </Tag>
                  {(crawlSession.uncrawled_pages || 0) > 0 && (
                    <Tag color="geekblue">
                      Uncrawled: <strong>{crawlSession.uncrawled_pages || 0}</strong>
                    </Tag>
                  )}
                  {(crawlSession.broken_pages || 0) > 0 && (
                    <Tag color="orange">
                      <CloseCircleOutlined /> Broken: <strong>{crawlSession.broken_pages || 0}</strong>
                    </Tag>
                  )}
                  {(crawlSession.failed_pages || 0) > 0 && (
                    <Tag color="red">
                      <CloseCircleOutlined /> Failed: <strong>{crawlSession.failed_pages || 0}</strong>
                    </Tag>
                  )}
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Total Pages: <strong>{crawlSession.total_pages || 0}</strong>
                </Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Max Depth">
              {crawlSession.max_depth}
            </Descriptions.Item>
            <Descriptions.Item label="Max Pages">
              {crawlSession.max_pages}
            </Descriptions.Item>
            <Descriptions.Item label="Started At">
              {crawlSession.started_at ? (
                <Space>
                  <CalendarOutlined />
                  <DateDisplay date={crawlSession.started_at} format="detailed" />
                </Space>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Completed At">
              {crawlSession.completed_at ? (
                <Space>
                  <ClockCircleOutlined />
                  <DateDisplay date={crawlSession.completed_at} format="detailed" />
                </Space>
              ) : '-'}
            </Descriptions.Item>
            {crawlSession.error_message && (
              <Descriptions.Item label="Error Message" span={2}>
                <Text type="danger">{crawlSession.error_message}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </>
      ),
    },
    {
      key: 'pages',
      label: `Pages (${statusFilter === 'all' ? crawlPages.length : filteredCrawlPages.length})`,
      children: (
        <div>
          <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Text strong>Filter by Status:</Text>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 200 }}
                options={[
                  { label: 'All Status', value: 'all' },
                  ...availableStatuses.map(status => ({
                    label: (
                      <Space>
                        <Tag color={getStatusColor(status)} style={{ textTransform: 'uppercase', margin: 0 }}>
                          {status}
                        </Tag>
                        <Text type="secondary">
                          ({crawlPages.filter(p => p.status === status).length})
                        </Text>
                      </Space>
                    ),
                    value: status,
                  })),
                ]}
              />
            </Space>
            <Text type="secondary">
              Showing {filteredCrawlPages.length} of {crawlPages.length} pages
            </Text>
          </Space>
          <Table
            columns={columns}
            dataSource={filteredCrawlPages}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} pages`,
            }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: '16px' }}>
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  {record.description && (
                    <div>
                      <Text strong>Description:</Text>
                      <div style={{ marginTop: 8 }}>
                        <Text>{record.description}</Text>
                      </div>
                    </div>
                  )}
                  {record.heading_hierarchy && Object.keys(record.heading_hierarchy).length > 0 && (
                    <div>
                      <Text strong>Headings:</Text>
                      <div
                        style={{
                          marginTop: 8,
                          padding: '12px',
                          background: crawlUi.fillSecondary,
                          borderRadius: 4,
                          border: crawlUi.neutralBorderSolid,
                        }}
                      >
                        {renderHeadingHierarchy(record.heading_hierarchy, 0)}
                      </div>
                    </div>
                  )}
                  {record.meta_tags && Object.keys(record.meta_tags).length > 0 && (
                    <div>
                      <Text strong>Meta Tags:</Text>
                      <div style={{ marginTop: 8 }}>
                        {renderMetaTags(record.meta_tags)}
                      </div>
                    </div>
                  )}
                  {(!record.meta_tags || Object.keys(record.meta_tags).length === 0) && (
                    <div>
                      <Text strong>Meta Tags:</Text>
                      <div style={{ marginTop: 8 }}>
                        {renderMetaTags(null)}
                      </div>
                    </div>
                  )}
                  <div>
                    {renderSEOLengthAnalysis(record)}
                  </div>
                  <div>
                    {renderSocialPreviews(record)}
                  </div>
                  {record.links && record.links.length > 0 && (
                    <div>
                      <Text strong>Links ({record.links.length}):</Text>
                      <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                        {record.links.map((link: string, idx: number) => (
                          <div key={idx}>
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              {link}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Space>
              </div>
            ),
            rowExpandable: (record) => !!(record.description || record.heading_hierarchy || record.meta_tags || record.links?.length),
          }}
        />
        </div>
      ),
    },
    {
      key: 'share-preview',
      label: 'Share Preview',
      children: (
        <>
          {mainPagePreview ? (
            <div>
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: 16 }}>
                  Preview for: <a href={mainPagePreview.url} target="_blank" rel="noopener noreferrer">{mainPagePreview.url}</a>
                </Text>
              </div>
              {renderSocialPreviews(mainPagePreview)}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Text type="secondary">No page data available yet. Please wait for crawling to complete.</Text>
            </div>
          )}
        </>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          {/* <Card> */}
            <Space style={{ marginBottom: 24 }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push('/crawl-sessions')}
              >
                Back to Crawl Sessions
              </Button>
              {crawlSession.company_websites?.company_id && (
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push(`/companies/${crawlSession.company_websites.company_id}`)}
                >
                  Back to Company
                </Button>
              )}
              {(crawlSession.status === 'crawling' || crawlSession.status === 'pending') && (
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchCrawlPages}
                  loading={loading}
                >
                  Refresh
                </Button>
              )}
            </Space>

            <div style={{ marginBottom: 32 }}>
              <Title level={2} style={{ marginBottom: 8 }}>
                <GlobalOutlined /> Crawl Session Details
              </Title>
              <Space size="middle">
                <Tag color={getStatusColor(crawlSession.status)} style={{ fontSize: 14, padding: '4px 12px', textTransform: 'uppercase' }}>
                  {crawlSession.status}
                </Tag>
              </Space>
            </div>

            <Tabs items={tabItems} />
          {/* </Card> */}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

