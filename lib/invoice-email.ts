/**
 * Email an invoice (or, once paid, its receipt) to the client through the connected mailbox.
 * The email carries the whole document as HTML, plus a link to open / download it in the portal.
 */
import dayjs from 'dayjs'

import { getAppSettings } from '@/lib/app-settings'
import { formatMoney } from '@/lib/billing-rate'
import { companies, companyUsers, find, get, getMany, invoices, type InvoicesRow, update, users } from '@/lib/fsdb'
import { InvoiceError } from '@/lib/invoices'
import { sendHtmlEmail } from '@/lib/ticket-notification-emails'

export type InvoiceEmailDoc = 'invoice' | 'receipt'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtDate = (d: string | null | undefined) => (d ? dayjs(d).format('D MMM YYYY') : '—')
const receiptNumber = (inv: InvoicesRow) => inv.number.replace(/^INV/, 'RCT')
const paragraphs = (text: string | null | undefined) =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div>${esc(l)}</div>`)
    .join('')

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** "a@x.com, b@y.com" → valid addresses (throws on an invalid one) */
export function parseRecipients(raw: unknown): string[] {
  const list = String(raw ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const bad = list.find((e) => !EMAIL_RE.test(e))
  if (bad) throw new InvoiceError(`"${bad}" is not a valid email address`)
  return [...new Set(list.map((e) => e.toLowerCase()))]
}

/** Who the invoice goes to by default: the company's email, else its portal admins. */
export async function defaultInvoiceRecipients(companyId: string): Promise<string[]> {
  const company = await get(companies, companyId)
  if (company?.email?.trim()) return [company.email.trim()]
  const admins = await find(companyUsers, { where: [['companyId', '==', companyId], ['companyRole', '==', 'company_admin']] })
  return (await getMany(users, admins.map((a) => a.userId))).filter((u) => u.status === 'active' && u.email).map((u) => u.email)
}

const TD = 'padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:14px;color:#0F172A;'
const TH = 'padding:8px 10px;border-bottom:2px solid #CBD5E1;font-size:12px;color:#64748B;text-align:left;text-transform:uppercase;letter-spacing:.04em;'
const NUM = 'text-align:right;white-space:nowrap;'

export async function buildInvoiceEmailHtml(inv: InvoicesRow, doc: InvoiceEmailDoc, message: string): Promise<string> {
  const [company, settings] = await Promise.all([get(companies, inv.companyId), getAppSettings()])
  const money = (n: number) => esc(formatMoney(n, inv.currency))
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const url = `${baseUrl}/invoices/${inv.id}${doc === 'receipt' ? '?doc=receipt' : ''}`
  const meta = (label: string, value: string) => `<tr><td style="padding:2px 12px 2px 0;color:#64748B;font-size:13px;">${label}</td><td style="font-size:13px;color:#0F172A;">${value}</td></tr>`

  const rows =
    doc === 'receipt'
      ? `<tr><td style="${TD}">Invoice ${esc(inv.number)} (${fmtDate(inv.periodFrom)} – ${fmtDate(inv.periodTo)})</td><td style="${TD}${NUM}">${money(inv.total)}</td></tr>` +
        `<tr><td style="${TD}">${inv.paidVia === 'balance' ? 'Paid from deposit balance' : 'Payment received'}</td><td style="${TD}${NUM}">− ${money(inv.total)}</td></tr>` +
        `<tr><td style="${TD}font-weight:700;${NUM}">Amount due</td><td style="${TD}font-weight:700;${NUM}">${money(0)}</td></tr>` +
        (inv.balanceAfter != null ? `<tr><td style="${TD}color:#64748B;${NUM}">Deposit balance after this payment</td><td style="${TD}color:#64748B;${NUM}">${money(inv.balanceAfter)}</td></tr>` : '')
      : inv.lines
          .map(
            (l) =>
              `<tr><td style="${TD}"><strong>${esc(l.title)}</strong><br><span style="color:#64748B;font-size:12px;">${l.retainer ? 'Monthly retainer' : `Ticket #${l.ticketId}${l.adjustment ? ' · price adjustment' : ''}`}</span></td>` +
              `<td style="${TD}${NUM}">${l.fixed || l.retainer ? '—' : `${Math.max(0.01, l.seconds / 3600).toFixed(2)} h`}</td>` +
              `<td style="${TD}${NUM}">${l.retainer ? 'Retainer' : l.adjustment ? 'Adjustment' : l.fixed ? 'Fixed price' : `${money(l.rate)}/h`}</td>` +
              `<td style="${TD}${NUM}">${money(l.amount)}</td></tr>`
          )
          .join('') + `<tr><td colspan="3" style="${TD}font-weight:700;${NUM}">Total due</td><td style="${TD}font-weight:700;${NUM}">${money(inv.total)}</td></tr>`

  const head = doc === 'receipt' ? `<tr><th style="${TH}">Description</th><th style="${TH}${NUM}">Amount</th></tr>` : `<tr><th style="${TH}">Description</th><th style="${TH}${NUM}">Hours</th><th style="${TH}${NUM}">Rate</th><th style="${TH}${NUM}">Amount</th></tr>`

  const block = (title: string, html: string) => (html ? `<div style="margin-top:18px;font-size:13px;color:#0F172A;"><div style="color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">${title}</div>${html}</div>` : '')

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0F172A;">` +
    `<div style="font-size:14px;line-height:1.6;margin-bottom:20px;">${message.split('\n').map((l) => (l.trim() ? `<div>${esc(l)}</div>` : '<div>&nbsp;</div>')).join('')}</div>` +
    `<div style="border:1px solid #E2E8F0;border-radius:12px;padding:20px;">` +
    `<table style="width:100%;border-collapse:collapse;"><tr>` +
    `<td style="vertical-align:top;"><div style="font-size:18px;font-weight:700;">${esc(settings.app_name)}</div><div style="font-size:12px;color:#64748B;">${paragraphs(settings.invoice_issuer)}</div></td>` +
    `<td style="vertical-align:top;text-align:right;"><div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:.06em;">${doc === 'receipt' ? 'Payment receipt' : 'Invoice'}</div><div style="font-size:18px;font-weight:700;">${esc(doc === 'receipt' ? receiptNumber(inv) : inv.number)}</div></td>` +
    `</tr></table>` +
    `<table style="margin:16px 0;border-collapse:collapse;">` +
    meta(doc === 'receipt' ? 'Received from' : 'Bill to', `<strong>${esc(company?.name ?? '—')}</strong>`) +
    (doc === 'receipt'
      ? meta('Payment date', fmtDate(inv.paidAt)) + meta('Paid with', inv.paidVia === 'balance' ? 'Deposit balance' : 'Payment received')
      : meta('Issue date', fmtDate(inv.issueDate)) + meta('Due date', fmtDate(inv.dueDate)) + meta('Period', `${fmtDate(inv.periodFrom)} – ${fmtDate(inv.periodTo)}`)) +
    `</table>` +
    `<table style="width:100%;border-collapse:collapse;"><thead>${head}</thead><tbody>${rows}</tbody></table>` +
    block('Notes', paragraphs(inv.notes)) +
    (doc === 'invoice' ? block('How to pay', paragraphs(settings.invoice_payment_info)) : '') +
    `<div style="margin-top:22px;"><a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0F9D8A;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">Open in the portal</a>` +
    `<div style="font-size:12px;color:#64748B;margin-top:6px;">Sign in to view or download it as PDF.</div></div>` +
    `</div>` +
    `<div style="font-size:12px;color:#64748B;margin-top:14px;">${esc(settings.invoice_footer || `Thank you — ${settings.app_name}`)}</div>` +
    `</div>`
  )
}

/** Send and remember when / to whom (shown on the invoice page). */
export async function sendInvoiceEmail(params: { invoiceId: string; doc: InvoiceEmailDoc; to: unknown; subject: unknown; message: unknown }): Promise<InvoicesRow> {
  const inv = await get(invoices, params.invoiceId)
  if (!inv) throw new InvoiceError('Invoice not found')
  if (inv.status === 'void') throw new InvoiceError('A void invoice cannot be sent')
  if (params.doc === 'receipt' && inv.status !== 'paid') throw new InvoiceError('The receipt exists once the invoice is paid')
  const to = parseRecipients(params.to)
  if (!to.length) throw new InvoiceError('Add at least one recipient')
  const subject = String(params.subject ?? '').trim()
  if (!subject) throw new InvoiceError('The subject is required')
  const html = await buildInvoiceEmailHtml(inv, params.doc, String(params.message ?? ''))
  const sent = await sendHtmlEmail(to.join(', '), subject, html)
  if (!sent) throw new InvoiceError('No mailbox is connected (Settings → Email)')
  return (await update(invoices, inv.id, { sentAt: new Date(), sentTo: to.join(', '), updatedAt: new Date() }))!
}
