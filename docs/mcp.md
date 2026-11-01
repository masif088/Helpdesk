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

## MCP server

An MCP server lets an AI assistant (Claude Desktop, Claude Code, and other MCP clients) use the portal as **tools**:
`tickets_list`, `tickets_detail`, `tickets_create`, `comments_create`, `calendar_list`, `calendar_create`, `calendar_update`,
`calendar_delete`, `team_activity`, and so on, one per API call. The assistant sees what each tool does and which inputs it takes,
so it needs no skill file.

It runs on your own computer, talks to the portal's API with your key, and can do exactly what that key may do.

**You need:** Node.js 22.18 or newer, this repository on your computer, and an API key (Settings → API keys, or Profile → API keys).
Give the key only the permissions the assistant needs.

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
