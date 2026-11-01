#!/usr/bin/env node
// MCP server for the ticketing portal over stdio. Needs Node.js 22.18 or newer (it loads the TypeScript files of this repo).
//
//   TICKETING_BASE_URL=https://your-portal  TICKETING_API_KEY=tk_live_...  node mcp/server.mjs
//
// Add it to Claude Desktop, Claude Code or any MCP client; see docs/mcp.md. It only talks to the portal's own API, with your key,
// so it can do what that key may do and nothing more.
import { createInterface } from 'node:readline'

import { createMcpHandler } from '../lib/mcp-server.ts'

const baseUrl = (process.env.TICKETING_BASE_URL || '').trim().replace(/\/+$/, '')
const apiKey = (process.env.TICKETING_API_KEY || '').trim()

if (!baseUrl || !/^https?:\/\//.test(baseUrl) || !apiKey) {
  console.error('Set TICKETING_BASE_URL (for example https://your-portal) and TICKETING_API_KEY (tk_live_...) before starting this server.')
  process.exit(1)
}

const handle = createMcpHandler({
  baseUrl,
  apiKey,
  fetchImpl: (url, init) => fetch(url, init),
})

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  try {
    const reply = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg)
    if (reply && (!Array.isArray(reply) || reply.length)) send(reply)
  } catch (err) {
    send({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' } })
  }
})
