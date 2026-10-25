
import { companyWebsites, crawlPages, crawlSessions, get, insert, update } from '@/lib/fsdb'

// Normalize URL to avoid duplicate crawling (normalize trailing slash)
// For root URLs (e.g., https://example.com/ and https://example.com), always use with trailing slash
// For other URLs, remove trailing slash
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // For root URLs (pathname is '/' or empty), always use with trailing slash
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return urlObj.origin + '/'
    }
    // For other URLs, remove trailing slash to normalize
    return url.replace(/\/$/, '')
  } catch {
    // If URL parsing fails, just remove trailing slash
    return url.replace(/\/$/, '')
  }
}

// Detect if a page is broken based on HTTP status code
// Broken pages are typically: 400, 401, 403, 404, 500, 502, 503, 504
export function isBrokenPage(httpStatus: number): boolean {
  // Client errors (4xx)
  if (httpStatus >= 400 && httpStatus < 500) {
    // Common broken page status codes
    return [400, 401, 403, 404].includes(httpStatus)
  }
  // Server errors (5xx)
  if (httpStatus >= 500 && httpStatus < 600) {
    // Common broken page status codes
    return [500, 502, 503, 504].includes(httpStatus)
  }
  return false
}

// Crawl process function (this should be implemented based on your crawling logic)
export async function startCrawlProcess(
  sessionId: string,
  companyWebsiteId: string,
  maxDepth: number,
  maxPages: number
) {
  console.log(`[Crawl] Starting process for session ${sessionId}, website ${companyWebsiteId}`)

  // Verify session exists before starting
  const sessionCheck = await get(crawlSessions, sessionId)

  if (!sessionCheck) {
    console.error('[Crawl] Session not found or invalid')
    throw new Error(`Crawl session ${sessionId} not found in database`)
  }

  console.log(`[Crawl] Session verified: ${sessionId}, status: ${sessionCheck.status}`)

  // Get company website URL
  const website = await get(companyWebsites, companyWebsiteId)

  if (!website) {
    console.error('[Crawl] Failed to fetch company website')
    throw new Error('Failed to fetch company website')
  }

  console.log(`[Crawl] Starting crawl from: ${website.url}`)

  const startUrl = website.url
  const visitedUrls = new Set<string>() // Store normalized URLs
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }]
  
  let crawledCount = 0
  let failedCount = 0
  let uncrawledCount = 0 // Track uncrawlable pages (non-HTML content)
  let brokenCount = 0 // Track broken pages (HTTP error status codes: 400, 401, 403, 404, 500, 502, 503, 504)

  // Simple crawler implementation
  // In production, you'd want to use a proper web scraping library
  while (queue.length > 0 && crawledCount < maxPages) {
    const { url: currentUrl, depth } = queue.shift()!

    // Normalize URL for duplicate checking
    const normalizedUrl = normalizeUrl(currentUrl)

    if (visitedUrls.has(normalizedUrl) || depth > maxDepth) {
      continue
    }

    visitedUrls.add(normalizedUrl)

    try {
      // Fetch page content with timeout, retry logic, and better error handling
      let response: Response | null = null
      let lastError: Error | null = null
      const maxRetries = 3
      let retryCount = 0
      
      while (retryCount < maxRetries) {
        try {
          // Create AbortController for timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 seconds timeout

          // Try to fetch with better error handling for Vercel
          // Remove Accept-Encoding as Vercel/Node.js handles this automatically
          response = await fetch(currentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
            },
            signal: controller.signal,
            // Add redirect handling
            redirect: 'follow',
            // Add cache control for Vercel
            cache: 'no-store',
          })

          clearTimeout(timeoutId)
          lastError = null
          break // Success, exit retry loop
        } catch (fetchError: any) {
          lastError = fetchError
          retryCount++
          
          // Log error for debugging
          console.error(`[Crawl] Fetch error (attempt ${retryCount}/${maxRetries}) for ${currentUrl}:`, {
            name: fetchError.name,
            message: fetchError.message,
            cause: fetchError.cause,
            stack: fetchError.stack,
          })
          
          // If it's the last retry, give up
          if (retryCount >= maxRetries) {
            // Handle fetch errors (network errors, CORS, timeout, etc.)
            failedCount++
            let errorMessage = 'Network error after retries'
            
            if (fetchError.name === 'AbortError') {
              errorMessage = 'Request timeout after retries'
            } else if (fetchError.message) {
              errorMessage = `Fetch failed: ${fetchError.message}`
            } else if (typeof fetchError === 'string') {
              errorMessage = `Fetch failed: ${fetchError}`
            } else if (fetchError.toString && fetchError.toString() !== '[object Object]') {
              errorMessage = `Fetch failed: ${fetchError.toString()}`
            } else {
              errorMessage = 'Fetch failed: Unknown error (check Vercel logs)'
            }
            
            // Log detailed error for debugging in Vercel
            console.error('[Crawl] Final fetch error after retries:', {
              url: currentUrl,
              error: fetchError,
              errorName: fetchError.name,
              errorMessage: fetchError.message,
              errorStack: fetchError.stack,
              errorCause: fetchError.cause,
            })
            
            await insert(crawlPages, {
              crawlSessionId: sessionId,
              url: currentUrl,
              depth,
              status: 'failed',
              errorMessage: errorMessage,
              crawledAt: new Date(),
            })

            await update(crawlSessions, sessionId, { failedPages: failedCount })

            continue
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }
      
      // If we exhausted retries or response is null, save as failed and skip
      if (lastError || !response) {
        failedCount++
        const errorMessage = lastError 
          ? (lastError.message || lastError.toString() || 'Fetch failed after retries')
          : 'No response received after retries'
        
        await insert(crawlPages, {
          crawlSessionId: sessionId,
          url: currentUrl,
          depth,
          status: 'failed',
          errorMessage: errorMessage,
          crawledAt: new Date(),
        })

        await update(crawlSessions, sessionId, { failedPages: failedCount })

        continue
      }

      const contentType = response.headers.get('content-type') || ''
      const httpStatus = response.status
      const finalUrl = response.url // Final URL after redirect (if any)

      // Detect redirect: if final URL differs from the requested URL, a redirect occurred
      const isRedirect = finalUrl !== currentUrl
      const redirectInfo = isRedirect ? `Redirected from ${currentUrl} to ${finalUrl}` : null

      if (!response.ok) {
        // Check if this is a broken page (specific HTTP error status codes)
        const isBroken = isBrokenPage(httpStatus)
        
        if (isBroken) {
          brokenCount++
        } else {
          failedCount++
        }
        
        await insert(crawlPages, {
          crawlSessionId: sessionId,
          url: currentUrl,
          depth,
          status: isBroken ? 'broken-page' : 'failed',
          httpStatusCode: httpStatus,
          contentType,
          errorMessage: `HTTP ${httpStatus}: ${response.statusText}${isRedirect ? `. ${redirectInfo}` : ''}`,
          crawledAt: new Date(),
        })

        // Update session
        await update(crawlSessions, sessionId, {
            crawledPages: crawledCount,
            failedPages: failedCount,
            brokenPages: brokenCount,
          })

        continue
      }

      // Handle non-HTML responses (only when not a redirect)
      // Non-HTML is not a failure, but uncrawlable (e.g. images, PDFs, etc.)
      if (!contentType.includes('text/html') && !isRedirect) {
        uncrawledCount++
        await insert(crawlPages, {
          crawlSessionId: sessionId,
          url: currentUrl,
          depth,
          status: 'uncrawl-page',
          httpStatusCode: httpStatus,
          contentType,
          errorMessage: `Non-HTML content: ${contentType}`,
          crawledAt: new Date(),
        })

        // Update session — uncrawl-page is neither failed nor successfully crawled HTML
        await update(crawlSessions, sessionId, {
            crawledPages: crawledCount,
            failedPages: failedCount,
            uncrawledPages: uncrawledCount,
            brokenPages: brokenCount,
            totalPages: crawledCount + failedCount + uncrawledCount,
          })

        continue
      }

      let html: string
      try {
        html = await response.text()
      } catch (textError: any) {
        // Handle text parsing errors
        failedCount++
        await insert(crawlPages, {
          crawlSessionId: sessionId,
          url: currentUrl,
          depth,
          status: 'failed',
          httpStatusCode: httpStatus,
          contentType,
          errorMessage: `Failed to parse response: ${textError.message}`,
          crawledAt: new Date(),
        })

        await update(crawlSessions, sessionId, { failedPages: failedCount })

        continue
      }
      
      // Parse HTML (simplified - in production, use a proper HTML parser like cheerio)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : null

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      const description = descMatch ? descMatch[1].trim() : null

      // Extract links (simplified)
      const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)
      const links: string[] = []
      for (const match of linkMatches) {
        let linkUrl = match[1]
        // Convert relative URLs to absolute
        if (linkUrl.startsWith('/')) {
          try {
            const baseUrl = new URL(currentUrl)
            linkUrl = new URL(linkUrl, baseUrl.origin).href
          } catch {
            continue
          }
        } else if (!linkUrl.startsWith('http')) {
          continue
        }
        
        // Only add links from the same domain
        try {
          const currentDomain = new URL(currentUrl).hostname
          const linkDomain = new URL(linkUrl).hostname
          // Normalize link URL for duplicate checking
          const normalizedLinkUrl = normalizeUrl(linkUrl)
          if (linkDomain === currentDomain && !visitedUrls.has(normalizedLinkUrl) && depth < maxDepth) {
            links.push(linkUrl)
            queue.push({ url: linkUrl, depth: depth + 1 })
          }
        } catch {
          continue
        }
      }

      // Extract headings with order and build nested structure
      interface HeadingNode {
        level: string
        child?: Record<string, HeadingNode>
      }

      type HeadingStructure = Record<string, HeadingNode>

      // Extract all headings (h1-h6) in order with their text content
      const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/h[1-6]>/gi
      const headingsInOrder: Array<{ level: string; text: string }> = []
      let match
      while ((match = headingRegex.exec(html)) !== null) {
        const level = match[1].toLowerCase()
        // Remove HTML tags from heading text
        const rawText = match[2].replace(/<[^>]*>/g, '').trim()
        if (rawText) {
          headingsInOrder.push({ level, text: rawText })
        }
      }

      // Build nested structure based on heading hierarchy
      const buildHeadingHierarchy = (items: Array<{ level: string; text: string }>): HeadingStructure => {
        if (items.length === 0) {
          return {}
        }

        const result: HeadingStructure = {}
        const stack: Array<{ structure: HeadingStructure; level: number }> = [
          { structure: result, level: 0 }
        ]

        for (const item of items) {
          const currentLevel = parseInt(item.level.replace('h', ''))
          const headingText = item.text

          // Pop stack until we find the right parent level
          // Parent level should be less than current level
          while (stack.length > 1 && stack[stack.length - 1].level >= currentLevel) {
            stack.pop()
          }

          const parent = stack[stack.length - 1].structure

          // Create new node
          const newNode: HeadingNode = {
            level: item.level,
          }

          // Initialize child structure for potential children
          const childStructure: HeadingStructure = {}
          newNode.child = childStructure

          // Add to parent
          parent[headingText] = newNode

          // Push to stack for potential children
          stack.push({ structure: childStructure, level: currentLevel })
        }

        // Clean up empty child objects
        const cleanEmptyChildren = (structure: HeadingStructure): void => {
          for (const key in structure) {
            if (structure[key].child && Object.keys(structure[key].child || {}).length === 0) {
              delete structure[key].child
            } else if (structure[key].child) {
              cleanEmptyChildren(structure[key].child!)
            }
          }
        }

        cleanEmptyChildren(result)
        return result
      }

      const headingHierarchy = buildHeadingHierarchy(headingsInOrder)

      // Extract meta tags - handle both name and property attributes
      const metaTags: Record<string, string> = {}
      
      // Match meta tags with name attribute: <meta name="..." content="...">
      const nameMatches = html.matchAll(/<meta[^>]*name=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)
      for (const match of nameMatches) {
        metaTags[match[1]] = match[2]
      }
      
      // Match meta tags with property attribute (Open Graph, Twitter Cards): <meta property="..." content="...">
      const propertyMatches = html.matchAll(/<meta[^>]*property=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)
      for (const match of propertyMatches) {
        metaTags[match[1]] = match[2]
      }
      
      // Also handle meta tags where content comes before name/property
      const reverseNameMatches = html.matchAll(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']([^"']+)["'][^>]*>/gi)
      for (const match of reverseNameMatches) {
        if (!metaTags[match[2]]) {
          metaTags[match[2]] = match[1]
        }
      }
      
      const reversePropertyMatches = html.matchAll(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']([^"']+)["'][^>]*>/gi)
      for (const match of reversePropertyMatches) {
        if (!metaTags[match[2]]) {
          metaTags[match[2]] = match[1]
        }
      }

      // Save crawled page
      // Include redirect information if redirect was detected
      try {
        await insert(crawlPages, {
          crawlSessionId: sessionId,
          url: currentUrl,
          title,
          description,
          depth,
          status: 'completed',
          httpStatusCode: httpStatus,
          contentType,
          headingHierarchy: headingHierarchy,
          metaTags: metaTags,
          links: links,
          errorMessage: isRedirect ? redirectInfo : null,
          crawledAt: new Date(),
        })
      } catch (insertError: any) {
        console.error(`[Crawl] Error inserting page ${currentUrl}:`, insertError)
        failedCount++
        const detailedErrorMessage = `Database error: ${insertError.message}${insertError.code ? ` (code: ${insertError.code})` : ''}${insertError.detail ? ` - ${insertError.detail}` : ''}`

        try {
          const errCode = (insertError as { code?: string }).code
          const errDetail = (insertError as { detail?: string }).detail ?? ''
          if (errCode === '23503' && String(errDetail).includes('crawl_sessions')) {
            console.error(`[Crawl] CRITICAL: Session ${sessionId} no longer exists in database. Stopping crawl.`)
            try {
              await update(crawlSessions, sessionId, {
                status: 'failed',
                errorMessage: `Crawl stopped: Session was deleted during crawl process. Last URL: ${currentUrl}`,
                completedAt: new Date(),
              })
            } catch {
              // Session might not exist
            }
            break
          }

          const sessionVerify = await get(crawlSessions, sessionId)
          if (!sessionVerify) {
            console.error(`[Crawl] CRITICAL: Session ${sessionId} no longer exists. Stopping crawl.`)
            break
          }

          try {
            await insert(crawlPages, {
              crawlSessionId: sessionId,
              url: currentUrl,
              depth,
              status: 'failed',
              errorMessage: detailedErrorMessage,
              crawledAt: new Date(),
            })
          } catch (failedInsertError: unknown) {
            const failCode = (failedInsertError as { code?: string }).code
            const failDetail = (failedInsertError as { detail?: string }).detail ?? ''
            console.error(`[Crawl] CRITICAL: Failed to save failed page for ${currentUrl}:`, failedInsertError)
            if (failCode === '23503' && String(failDetail).includes('crawl_sessions')) {
              break
            }
            try {
              await update(crawlSessions, sessionId, {
                errorMessage: `CRITICAL: Failed to save failed page. Original: ${insertError.message}`,
              })
            } catch {
              // ignore
            }
          }
        } catch (saveError: unknown) {
          console.error(`[Crawl] CRITICAL: Exception saving failed page for ${currentUrl}:`, saveError)
        }

        try {
          await update(crawlSessions, sessionId, { failedPages: failedCount })
        } catch {
          // ignore
        }
        continue
      }

      crawledCount++
      console.log(`[Crawl] Saved page ${crawledCount}/${maxPages}: ${currentUrl}`)

      // Update session progress
      try {
        await update(crawlSessions, sessionId, {
          crawledPages: crawledCount,
          failedPages: failedCount,
          uncrawledPages: uncrawledCount,
          brokenPages: brokenCount,
          totalPages: crawledCount + failedCount + uncrawledCount,
        })
      } catch (updateError) {
        console.error(`[Crawl] Error updating session progress:`, updateError)
      }

      // Add a small delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (error: any) {
      failedCount++
      const errorMessage = error.message || error.toString() || 'Unknown error'
      console.error(`[Crawl] Error crawling ${currentUrl}:`, errorMessage, error)
      
      await insert(crawlPages, {
        crawlSessionId: sessionId,
        url: currentUrl,
        depth,
        status: 'failed',
        errorMessage: errorMessage,
        crawledAt: new Date(),
      })

      await update(crawlSessions, sessionId, {
        failedPages: failedCount,
      })
    }
  }

  // Mark crawl session as completed
  console.log(`[Crawl] Completed session ${sessionId}: ${crawledCount} crawled, ${failedCount} failed, ${uncrawledCount} uncrawled, ${brokenCount} broken`)
  
  try {
    await update(crawlSessions, sessionId, {
      status: 'completed',
      completedAt: new Date(),
      totalPages: crawledCount + failedCount + uncrawledCount,
      crawledPages: crawledCount,
      failedPages: failedCount,
      uncrawledPages: uncrawledCount,
      brokenPages: brokenCount,
    })
  } catch (finalUpdateError) {
    console.error(`[Crawl] Error marking session as completed:`, finalUpdateError)
    throw finalUpdateError
  }
  
  console.log(`[Crawl] Session ${sessionId} completed successfully`)
}

