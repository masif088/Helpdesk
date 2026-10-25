/**
 * The skill file (SKILL.md) an AI assistant loads to work with the ticket API. The base URL is filled in by the caller;
 * the key itself is never part of it: the assistant reads it from the environment variable TICKETING_API_KEY.
 */
export function buildApiSkill(baseUrl: string, callsPerHour = 100): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `---
name: ticketing-api
description: Read, create and comment on support tickets in the ticketing portal at ${base} through its API. Use when the user asks to open a ticket, check a ticket's status or history, search tickets, or add a comment or follow-up to a ticket.
---

# Ticketing portal API

Base URL: \`${base}\`
Authentication: header \`Authorization: Bearer $TICKETING_API_KEY\` on every call. The key is in the environment variable \`TICKETING_API_KEY\`. Never print it, never put it in a ticket or comment, never send it anywhere except this base URL.

The key acts as one portal user, so you only see what that user sees (a customer contact sees only their own company's tickets). Bodies are JSON (\`Content-Type: application/json\`). Text fields (\`description\`, \`comment\`) are HTML: wrap paragraphs in \`<p>…</p>\`, escape \`<\` and \`&\` in plain text.

## What you can do

| Goal | Call |
| --- | --- |
| Find out the valid types, teams and statuses | \`GET /api/tickets/lookup\` |
| List or search tickets | \`GET /api/tickets?limit=20&offset=0&status=open&search=printer\` |
| Read one ticket with its comments | \`GET /api/tickets/{id}/detail\` |
| Create a ticket | \`POST /api/tickets\` |
| Comment on a ticket | \`POST /api/tickets/{id}/comments\` |

Nothing else is available: no edit, delete, close, assign or upload. If the user wants one of those, tell them to do it in the portal.

## Creating a ticket

1. Call \`GET /api/tickets/lookup\` once and pick the type that fits (\`ticketTypes[].id\`). A type is required.
2. Search first (\`GET /api/tickets?search=<keywords>\`). If the same problem is already open, add a comment there instead of a duplicate.
3. \`POST /api/tickets\` with:

\`\`\`json
{ "title": "Printer on floor 2 is offline", "description": "<p>Since this morning. Error E-102.</p>", "type_id": 3, "priority": 2 }
\`\`\`

The answer contains the new ticket \`id\`. Tell the user the number and link: \`${base}/tickets/{id}\`.

## Commenting

\`\`\`json
{ "comment": "<p>Still happening after a restart.</p>" }
\`\`\`

Customers' comments are visible to the support team and the customer's colleagues. Staff keys write internal notes by default; add \`"visibility": "reply"\` only when the user asks for a reply to the customer.

## Reading

\`GET /api/tickets/{id}/detail\` returns \`ticketData\` (title, status, assignees, …) and \`comments\` (newest window; \`comments_has_older\` tells you more exist). Summarise for the user instead of pasting raw JSON. Comments made through the API carry \`via\` such as "API · <key name>".

## Rules

- Ask the user before creating a ticket or posting a comment unless they clearly told you to. Show them the text first when it is long or sensitive.
- Do not invent ids. Ticket ids come from the user or from a search; type ids come from the lookup.
- Make as few calls as you can. The key is limited to ${callsPerHour} calls per hour by default (your admin may have set another limit). Do not poll and do not loop over all tickets.
- Status codes: \`401\` key missing, wrong, revoked, expired or without permission for that call; \`403\` this endpoint is not available to keys; \`404\` ticket not found or not yours; \`400\` read \`error\` and fix the request; \`429\` limit reached, stop and tell the user when to retry (\`Retry-After\` seconds). Never retry a 401, 403 or 429 in a loop.
`
}
