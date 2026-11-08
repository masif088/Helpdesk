'use client'

import { CopyOutlined } from '@ant-design/icons'
import { App, Input, Typography } from 'antd'

const { Text } = Typography

/** How to connect an AI assistant: API keys are no longer made by hand, assistants sign in through the MCP connector (docs/mcp.md). */
export default function McpConnectorInfo() {
  const { message } = App.useApp()
  const origin = typeof window === 'undefined' ? 'https://your-portal' : window.location.origin
  const address = `${origin}/api/mcp`

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="cell-strong">Connect an AI assistant (MCP)</div>
      <Text type="secondary">
        There are no keys to make or paste. Add this address to the assistant as a connector, sign in here when it asks, and tick what it may do:
      </Text>
      <Input.Search
        readOnly
        value={address}
        enterButton={<CopyOutlined />}
        onSearch={() => {
          void navigator.clipboard.writeText(address)
          message.success('Copied')
        }}
        style={{ maxWidth: 520 }}
      />
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          <b>Claude</b> (claude.ai or the desktop app): Settings → Connectors → <i>Add custom connector</i>, paste the address, <i>Connect</i>.
        </li>
        <li>
          <b>Claude Code:</b> <Text code>claude mcp add --transport http ticketing {address}</Text>, then <Text code>/mcp</Text> to sign in.
        </li>
        <li>Other assistants (Cursor, ChatGPT developer mode, …): add a remote MCP server with the address.</li>
      </ul>
      <Text type="secondary" style={{ fontSize: 12 }}>
        The assistant acts as the person who signs in and sees only what they see. The connection shows in the list as “Connector · …”: revoke it there and it stops at once.
      </Text>
    </div>
  )
}
