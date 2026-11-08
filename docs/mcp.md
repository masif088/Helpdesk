# MCP server and OpenAPI

Two ways for other tools to use this portal without hand-written glue. Both are made from the same endpoint list
(`lib/api-catalog.ts`) as the API builder and the skill file, so they always match the API.

## OpenAPI

`GET <your portal>/api/openapi.json` is the API as an OpenAPI 3.1 file (public, no key inside). Use it to:

- import the API into **Postman** or **Insomnia**,
- give a **ChatGPT Action** (Custom GPT) the URL,
- browse it in **Swagger UI**, or generate a client library in any language.

Every call needs an API key: send it as `Authorization: Bearer tk_live_…` (the file declares this as the `bearerAuth` scheme).
Each operation says which key permission it needs (`x-key-scope`).

## Connector: no key to paste

**This is the way to connect an assistant: API keys can no longer be made by hand** (the key pages answer `403`; keys made earlier work until they expire or are revoked).

Some assistants refuse to take an API key as input. The portal is therefore also a **remote MCP server** that signs people in the normal way
(OAuth), the same way the connectors for Google Drive or Slack work. Nothing is pasted anywhere.

**Address to add:** `https://<your portal>/api/mcp`

- **Claude (claude.ai and the desktop app):** Settings → Connectors → *Add custom connector*, paste the address, and choose *Connect*.
- **Claude Code:** `claude mcp add --transport http ticketing https://<your portal>/api/mcp`, then `/mcp` to sign in.
- **Other clients** (Cursor, ChatGPT developer mode, …): add a remote MCP server with that address.

The assistant sends you to the portal. You sign in with your usual login, see who is asking, and tick what it may do:

| Ticked by default | Not ticked (you decide) |
| --- | --- |
| read tickets, read the calendar, read team activity (managers) | create tickets, comment, change tickets, add or change calendar events |

The assistant then gets only the tools those permissions allow, acts **as you** (your role and company decide what it sees) and is held to the
same hourly limit as any key. Tickets and comments it makes are marked *API · Connector · <assistant>*.

**Ending a connection:** it appears in your profile under *API keys* as **Connector · <assistant>**. Revoke it there (admins also in Settings →
API keys) and it stops at once, refresh included. Access lasts one hour and is renewed by the assistant on its own for up to 60 days without you
signing in again; after that it asks you to connect again. Connections do not count towards the number of keys you may make by hand.

How it works, for the curious: the assistant finds `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`,
registers itself at `/api/oauth/register`, sends you to `/oauth/authorize` (PKCE, S256 only) and swaps the code at `/api/oauth/token`. The access token
is an ordinary API key (`tk_live_…`, kind `oauth`) that rotates every hour, and `/api/mcp` answers each tool call by calling the portal's own API with it.
Only hashes of codes and refresh tokens are stored (`oauth_grants`). Client ids are signed with `CSAT_LINK_SECRET`, so **changing that secret makes every
assistant connect again**. The portal needs a public https address (`NEXT_PUBLIC_SITE_URL` if it sits behind a proxy that hides it).

## MCP server on your computer (with a key)

An MCP server lets an AI assistant (Claude Desktop, Claude Code, and other MCP clients) use the portal as **tools**:
`tickets_list`, `tickets_detail`, `tickets_create`, `comments_create`, `calendar_list`, `calendar_create`, `calendar_update`,
`calendar_delete`, `team_activity`, and so on, one per API call. The assistant sees what each tool does and which inputs it takes,
so it needs no skill file.

This version runs on your own computer and talks to the portal's API with a key. **It only works with a key that already exists**, because new keys can no longer be made: use the connector above.

**You need:** Node.js 22.18 or newer, this repository on your computer, and an API key made before the change (none can be made now).

**Claude Desktop** (`claude_desktop_config.json`) and other clients that use the same format:

```json
{
  "mcpServers": {
    "ticketing": {
      "command": "node",
      "args": ["/full/path/to/this/repo/mcp/server.mjs"],
      "env": {
        "TICKETING_BASE_URL": "https://your-portal",
        "TICKETING_API_KEY": "tk_live_..."
      }
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add ticketing --env TICKETING_BASE_URL=https://your-portal --env TICKETING_API_KEY=tk_live_... -- node /full/path/to/this/repo/mcp/server.mjs
```

**Try it by hand** (it speaks JSON lines on stdin and stdout):

```bash
TICKETING_BASE_URL=https://your-portal TICKETING_API_KEY=tk_live_... node mcp/server.mjs
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

### What it does and does not do

- Reads are marked read-only and deletes destructive, so a client can ask for confirmation. The server's own instructions tell the
  assistant to ask you before it creates, changes or deletes anything.
- Long answers are cut at 100,000 characters with a note to narrow the request with filters.
- The key is read from the environment and sent only to `TICKETING_BASE_URL`. It is never part of a tool name, a description or an answer.
- Errors (`401`, `403`, `429`, …) come back as tool errors with the portal's message, so the assistant can tell you why.
- The server holds no state and talks to the portal over plain HTTP: stop it any time.

The protocol part is `lib/mcp-server.ts` (tested without a network); the program that runs it over stdio is `mcp/server.mjs`.
