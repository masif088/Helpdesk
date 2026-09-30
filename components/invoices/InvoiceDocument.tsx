'use client'

import { CheckCircleOutlined, DownloadOutlined, MailOutlined, StopOutlined, UndoOutlined, WalletOutlined } from '@ant-design/icons'
import { App, Button, Input, Modal, Segmented, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import BackLink from '@/components/common/BackLink'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { formatMoney } from '@/lib/billing-rate'
import type { invoiceToJson } from '@/lib/invoices'

type Invoice = ReturnType<typeof invoiceToJson>
type Doc = 'invoice' | 'receipt'

interface Props {
  invoice: Invoice
  client: { name: string; email: string | null }
  /** markUrl: square brand mark (the sidebar logo may be light-on-dark and unreadable on paper) */
  issuer: { name: string; markUrl: string | null; details: string | null; paymentInfo: string | null; footer: string | null }
  /** Deposit balance available for this invoice (excluding it) */
  depositAvailable: number
  initialDoc: Doc
  /** Client's own view in the portal: no pay / void actions, back to their company's Billing tab */
  readOnly?: boolean
  /** Staff: who "Send by email" goes to by default (company email, else its portal admins) */
  defaultRecipients?: string[]
}

const fmtDate = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')
const fmtHours = (seconds: number) => `${Math.max(0.01, seconds / 3600).toFixed(2)} h`
const lines = (text: string | null) => (text ?? '').split('\n').filter((l) => l.trim())

const STATUS: Record<string, { label: string; color: string }> = {
  issued: { label: 'Unpaid', color: '#D97706' },
  paid: { label: 'Paid', color: '#16A34A' },
  void: { label: 'Void', color: '#94A3B8' },
}

/** Invoice (bill to the client) and, once paid, its receipt. A4 layout; "Download PDF" prints to PDF. */
export default function InvoiceDocument({ invoice: initial, client, issuer, depositAvailable, initialDoc, readOnly = false, defaultRecipients = [] }: Props) {
  const { message, modal } = App.useApp()
  const router = useRouter()
  const [inv, setInv] = useState(initial)
  const [doc, setDoc] = useState<Doc>(initialDoc)
  const [busy, setBusy] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [reference, setReference] = useState('')
  const [mail, setMail] = useState<{ to: string; subject: string; message: string } | null>(null)
  const [sending, setSending] = useState(false)

  const money = (n: number) => formatMoney(n, inv.currency)
  const receiptNumber = inv.number.replace(/^INV/, 'RCT')
  const canPayFromBalance = inv.status === 'issued' && depositAvailable + 0.005 >= inv.total

  const act = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')
      setInv(data)
      if (data.status === 'paid') setDoc('receipt')
      else setDoc('invoice')
      router.refresh()
      return true
    } catch (e) {
      message.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const openMail = () => {
    const total = money(inv.total)
    const receipt = doc === 'receipt'
    setMail({
      to: inv.sent_to || defaultRecipients.join(', '),
      subject: receipt ? `Payment receipt ${receiptNumber} — ${issuer.name}` : `Invoice ${inv.number} — ${issuer.name}`,
      message: receipt
        ? `Hello ${client.name},\n\nThank you. We received your payment of ${total} for invoice ${inv.number}. The receipt is below.`
        : `Hello ${client.name},\n\nPlease find invoice ${inv.number} for ${total} below${inv.due_date ? `, due on ${fmtDate(inv.due_date)}` : ''}.\n\nLet us know if you have any questions.`,
    })
  }

  const sendMail = async () => {
    if (!mail) return
    setSending(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc, ...mail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The email could not be sent')
      setInv(data)
      setMail(null)
      message.success(`${doc === 'receipt' ? 'Receipt' : 'Invoice'} sent to ${data.sent_to}`)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const switchDoc = (d: Doc) => {
    setDoc(d)
    // Keep the URL (and so the PDF file name) in sync with the document shown
    router.replace(d === 'receipt' ? `?doc=receipt` : '?', { scroll: false })
  }

  const s = STATUS[inv.status] ?? STATUS.issued

  return (
    <div className="invoice-page">
      <div className="invoice-toolbar">
        <BackLink href={readOnly ? '/my-company?tab=billing' : `/companies/${inv.company_id}?tab=billing`}>{readOnly ? 'Billing' : client.name}</BackLink>
        <span style={{ flex: 1 }} />
        {inv.status === 'paid' ? (
          <Segmented<Doc>
            value={doc}
            onChange={switchDoc}
            options={[
              { value: 'invoice', label: 'Invoice' },
              { value: 'receipt', label: 'Receipt' },
            ]}
          />
        ) : null}
        {!readOnly && inv.status === 'issued' ? (
          <>
            <Tooltip title={canPayFromBalance ? `Deposit balance: ${money(depositAvailable)}` : `Deposit balance ${money(depositAvailable)} does not cover it`}>
              <Button
                icon={<WalletOutlined />}
                disabled={!canPayFromBalance}
                loading={busy}
                onClick={() =>
                  modal.confirm({
                    title: 'Pay from deposit balance',
                    content: `Take ${money(inv.total)} from ${client.name}'s deposit (${money(depositAvailable)}) and mark ${inv.number} as paid?`,
                    okText: 'Pay from balance',
                    onOk: () => act('pay_from_balance'),
                  })
                }
              >
                Pay from balance
              </Button>
            </Tooltip>
            <Button icon={<CheckCircleOutlined />} loading={busy} onClick={() => setPaymentOpen(true)}>
              Record payment
            </Button>
            <Button
              icon={<StopOutlined />}
              danger
              loading={busy}
              onClick={() =>
                modal.confirm({ title: `Void ${inv.number}?`, content: 'The invoice stays on record but no longer counts as owed.', okText: 'Void', okButtonProps: { danger: true }, onOk: () => act('void') })
              }
            >
              Void
            </Button>
          </>
        ) : null}
        {!readOnly && inv.status === 'paid' ? (
          <Button
            icon={<UndoOutlined />}
            loading={busy}
            onClick={() =>
              modal.confirm({
                title: 'Mark as unpaid?',
                content: inv.paid_via === 'payment' ? 'The payment recorded for it is removed.' : 'The amount goes back to the deposit balance.',
                okText: 'Mark unpaid',
                onOk: () => act('mark_unpaid'),
              })
            }
          >
            Mark unpaid
          </Button>
        ) : null}
        {!readOnly && inv.status !== 'void' ? (
          <Tooltip title={inv.sent_at ? `Last sent ${dayjs(inv.sent_at).format('D MMM YYYY HH:mm')} to ${inv.sent_to}` : undefined}>
            <Button icon={<MailOutlined />} onClick={openMail}>
              {inv.sent_at ? 'Send again' : 'Send by email'}
            </Button>
          </Tooltip>
        ) : null}
        <Button type="primary" icon={<DownloadOutlined />} onClick={() => window.print()}>
          Download PDF
        </Button>
      </div>

      <article className="invoice-sheet">
        <header className="invoice-head">
          <div>
            <div className="invoice-brand">
              {issuer.markUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={issuer.markUrl} alt="" className="invoice-mark" />
              ) : null}
              <span>{issuer.name}</span>
            </div>
            {lines(issuer.details).length ? (
              <div className="invoice-issuer">
                {lines(issuer.details).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="invoice-title">
            <div className="invoice-title__kind">{doc === 'receipt' ? 'Payment receipt' : 'Invoice'}</div>
            <div className="invoice-title__number">{doc === 'receipt' ? receiptNumber : inv.number}</div>
            {doc === 'invoice' ? <StatusPill color={s.color} title={s.label} /> : <StatusPill color="#16A34A" title="Paid" />}
          </div>
        </header>

        <section className="invoice-meta">
          <div>
            <div className="invoice-label">{doc === 'receipt' ? 'Received from' : 'Bill to'}</div>
            <div className="invoice-strong">{client.name}</div>
            {client.email ? <div>{client.email}</div> : null}
          </div>
          <div className="invoice-meta__dates">
            {doc === 'receipt' ? (
              <>
                <div><span className="invoice-label">Payment date</span> {fmtDate(inv.paid_at)}</div>
                <div><span className="invoice-label">For invoice</span> {inv.number}</div>
                <div><span className="invoice-label">Paid with</span> {inv.paid_via === 'balance' ? 'Deposit balance' : 'Payment received'}</div>
              </>
            ) : (
              <>
                <div><span className="invoice-label">Issue date</span> {fmtDate(inv.issue_date)}</div>
                <div><span className="invoice-label">Due date</span> {fmtDate(inv.due_date)}</div>
                <div><span className="invoice-label">Period</span> {fmtDate(inv.period_from)} – {fmtDate(inv.period_to)}</div>
              </>
            )}
          </div>
        </section>

        {doc === 'invoice' ? (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Hours</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.ticketId}>
                  <td>
                    <div className="invoice-strong">{l.title}</div>
                    <div className="invoice-muted">Ticket #{l.ticketId}{l.adjustment ? ' · price adjustment' : ''}</div>
                  </td>
                  <td className="num">{l.fixed ? '—' : fmtHours(l.seconds)}</td>
                  <td className="num">{l.adjustment ? 'Adjustment' : l.fixed ? 'Fixed price' : `${money(l.rate)}/h`}</td>
                  <td className="num">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="num">Total due</td>
                <td className="num invoice-total">{money(inv.total)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="invoice-table">
            <tbody>
              <tr>
                <td>Invoice {inv.number} ({fmtDate(inv.period_from)} – {fmtDate(inv.period_to)})</td>
                <td className="num">{money(inv.total)}</td>
              </tr>
              <tr>
                <td>{inv.paid_via === 'balance' ? 'Paid from deposit balance' : 'Payment received'}</td>
                <td className="num">− {money(inv.total)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="num">Amount due</td>
                <td className="num invoice-total">{money(0)}</td>
              </tr>
              {inv.balance_after != null ? (
                <tr>
                  <td className="num invoice-muted">Deposit balance after this payment</td>
                  <td className="num invoice-muted">{money(inv.balance_after)}</td>
                </tr>
              ) : null}
            </tfoot>
          </table>
        )}

        {doc === 'invoice' && inv.status === 'issued' && depositAvailable > 0 ? (
          <p className="invoice-muted" style={{ marginTop: 8 }}>
            Deposit balance on account: {money(depositAvailable)}
          </p>
        ) : null}

        {inv.notes ? (
          <section className="invoice-block">
            <div className="invoice-label">Notes</div>
            <div style={{ whiteSpace: 'pre-line' }}>{inv.notes}</div>
          </section>
        ) : null}

        {doc === 'invoice' && lines(issuer.paymentInfo).length ? (
          <section className="invoice-block">
            <div className="invoice-label">How to pay</div>
            {lines(issuer.paymentInfo).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </section>
        ) : null}

        <footer className="invoice-footer">{issuer.footer || `Thank you — ${issuer.name}`}</footer>
      </article>

      <Modal
        title={`Send ${doc === 'receipt' ? `receipt ${receiptNumber}` : `invoice ${inv.number}`} by email`}
        open={mail != null}
        onCancel={() => setMail(null)}
        okText="Send"
        okButtonProps={{ icon: <MailOutlined />, disabled: !mail?.to.trim() || !mail?.subject.trim() }}
        confirmLoading={sending}
        onOk={() => void sendMail()}
        width={560}
      >
        {mail ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="mt-field">
              <span className="mt-field__label">To</span>
              <Input value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} placeholder="client@company.com, finance@company.com" />
            </label>
            <label className="mt-field">
              <span className="mt-field__label">Subject</span>
              <Input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            </label>
            <label className="mt-field">
              <span className="mt-field__label">Message</span>
              <Input.TextArea rows={6} value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} />
            </label>
            <span className="invoice-muted" style={{ fontSize: 12 }}>
              The {doc === 'receipt' ? 'receipt' : 'invoice'} is included in the email, with a link to open it in the portal. It is sent from the connected mailbox.
            </span>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={`Record payment for ${inv.number}`}
        open={paymentOpen}
        onCancel={() => setPaymentOpen(false)}
        okText="Mark as paid"
        confirmLoading={busy}
        onOk={async () => {
          if (await act('record_payment', { reference })) setPaymentOpen(false)
        }}
      >
        <p>
          Records {money(inv.total)} received from {client.name} and marks the invoice as paid.
        </p>
        <Input placeholder={`Transfer reference (default: ${inv.number})`} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Modal>
    </div>
  )
}
