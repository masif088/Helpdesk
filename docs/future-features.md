# Future features

Ideas that are not built yet, with enough context to pick them up later. Move an item out of this file (into the
code and `docs/`) when it ships.

Already built from the earlier list: SLA per client and ticket type, automatic retainer invoices, CSAT (customer
satisfaction rating after a ticket is closed).

---

## 1. Canned responses and knowledge base

**Goal:** answer faster and get fewer repeat tickets.

- **Canned responses (staff).** Reply templates with placeholders (`{{customer_name}}`, `{{ticket_number}}`,
  `{{agent_name}}`, `{{company}}`). Inserted from the comment editor with a picker or `/` shortcut. Scope: shared
  (everyone), per team, or personal. Track how often each is used so unused ones can be pruned.
  - Reuse: `lib/message-template-merge.ts` / `message-template-placeholders.ts` already merge placeholders, and
    `app/api/tickets/[id]/agent-reply-template` exists. Start by generalising those rather than building a new engine.
- **Knowledge base (customers).** The app already has `knowledgeBaseArticles` (`lib/knowledge-base-article-roles.ts`)
  and `companyKnowledgeBases`. Missing is the customer-facing side:
  - a searchable "Help" page in the portal (title + body search, categories),
  - "Suggested articles" while the customer types the title of a new ticket (deflection),
  - "Was this helpful?" counters per article,
  - a button on a ticket to insert an article link into a reply.
- **Open questions:** public (no login) articles or portal-only? Per-client articles (already modelled by
  `companyKnowledgeBases`) versus global ones?

## 2. Online payment (Midtrans / Xendit)

**Goal:** a customer pays an invoice or tops up the deposit from the portal, and the invoice turns paid by itself.

- A "Pay now" button on the invoice page (portal and staff view) and a "Top up deposit" action on Billing.
- Create a payment session with the provider (invoice number as the order id, amount, currency, customer email).
  Midtrans Snap or Xendit Invoice are the quickest: hosted page, no card data touches this app.
- **Webhook** `POST /api/payments/<provider>/webhook`: verify the signature, be idempotent (provider order id stored on
  the payment), then call the existing `payInvoice(id, 'payment', …, reference)` or record a `companyPayments` row for a
  top-up. Both already exist in `lib/invoices.ts`, so the money model does not change.
- Needs: merchant account, server key + client key in `.env.local` / App Hosting secrets (never in the repo), a public
  webhook URL registered with the provider, sandbox testing first.
- **Details to decide:** who pays the provider fee (absorb, or add a line to the invoice); IDR only or USD too;
  partial payments; refunds (record a negative payment); a failed/expired payment must leave the invoice unpaid.
- **Risks:** unsigned or replayed webhooks (verify + idempotency), amount tampering (always recompute the amount
  server side from the invoice), and double settlement when an admin also marks the invoice paid by hand.

## Other ideas worth keeping

- Business hours and holidays for SLA (the first version counts calendar time).
- SLA by ticket priority level (there is no High/Low level yet; `tickets.priority` is queue position).
- Pause the SLA clock while waiting on the customer.
- Hourly cron is coarse for 1-hour SLAs; consider running the SLA check every 15 minutes.
- Public CSAT link in the close email (so customers need not log in), and a CSAT follow-up for low scores.
- Retainer: usage allowance (included hours) with overage billed automatically, and proration for a mid-month start.
- Slack alert for SLA breaches.
