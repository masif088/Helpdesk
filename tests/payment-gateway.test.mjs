// Pure logic: node --test tests/
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createCheckout,
  gatewayAmount,
  gatewayConfig,
  handleGatewayEvent,
  mayPayOnline,
  midtransOutcome,
  midtransSignature,
  newOrderId,
  verifyMidtrans,
  verifyXendit,
  xenditOutcome,
} from '../lib/payment-gateway.ts'

const midtrans = gatewayConfig({ PAYMENT_PROVIDER: 'midtrans', MIDTRANS_SERVER_KEY: 'SB-Mid-server-xyz' })
const xendit = gatewayConfig({ PAYMENT_PROVIDER: 'xendit', XENDIT_SECRET_KEY: 'xnd_development_abc', XENDIT_CALLBACK_TOKEN: 'cb-token' })

describe('which provider is on', () => {
  it('needs the provider name and its keys', () => {
    assert.equal(midtrans.provider, 'midtrans')
    assert.equal(midtrans.production, false)
    assert.equal(xendit.provider, 'xendit')
    assert.equal(gatewayConfig({}), null)
    assert.equal(gatewayConfig({ PAYMENT_PROVIDER: 'midtrans' }), null)
    assert.equal(gatewayConfig({ PAYMENT_PROVIDER: 'xendit', XENDIT_SECRET_KEY: 'k' }), null) // no callback token
    assert.equal(gatewayConfig({ PAYMENT_PROVIDER: 'paypal', MIDTRANS_SERVER_KEY: 'k' }), null)
  })
  it('knows the live mode of Midtrans', () => {
    assert.equal(gatewayConfig({ PAYMENT_PROVIDER: 'midtrans', MIDTRANS_SERVER_KEY: 'k', MIDTRANS_IS_PRODUCTION: 'TRUE' }).production, true)
  })
  it('offers online payment only for an issued rupiah invoice', () => {
    assert.equal(mayPayOnline({ status: 'issued', currency: 'IDR', total: 150000 }, midtrans), true)
    assert.equal(mayPayOnline({ status: 'paid', currency: 'IDR', total: 150000 }, midtrans), false)
    assert.equal(mayPayOnline({ status: 'void', currency: 'IDR', total: 150000 }, midtrans), false)
    assert.equal(mayPayOnline({ status: 'issued', currency: 'USD', total: 150 }, midtrans), false)
    assert.equal(mayPayOnline({ status: 'issued', currency: 'IDR', total: 0 }, midtrans), false)
    assert.equal(mayPayOnline({ status: 'issued', currency: 'IDR', total: 150000 }, null), false)
  })
  it('asks for whole rupiah', () => {
    assert.equal(gatewayAmount(150000.4), 150000)
    assert.equal(gatewayAmount(150000.5), 150001)
    assert.equal(gatewayAmount(NaN), 0)
  })
  it('makes a new order id every time, within the provider limit', () => {
    const a = newOrderId('INV-2026-0007', 1_700_000_000_000, 0.1)
    const b = newOrderId('INV-2026-0007', 1_700_000_000_001, 0.1)
    assert.notEqual(a, b)
    assert.match(a, /^INV-2026-0007-[a-z0-9]+$/)
    assert.ok(newOrderId('X'.repeat(80)).length <= 50)
    assert.equal(newOrderId('INV 2026/7', 0, 0), 'INV-2026-7-00')
  })
})

describe('Midtrans notifications', () => {
  const body = (over = {}) => {
    const n = { order_id: 'INV-1-abc', status_code: '200', gross_amount: '150000.00', transaction_status: 'settlement', ...over }
    return { ...n, signature_key: midtransSignature(n.order_id, n.status_code, n.gross_amount, 'SB-Mid-server-xyz') }
  }
  it('accepts the signature made with our key, and nothing else', () => {
    assert.equal(verifyMidtrans(body(), 'SB-Mid-server-xyz'), true)
    assert.equal(verifyMidtrans(body(), 'another-key'), false)
    assert.equal(verifyMidtrans({ ...body(), gross_amount: '1.00' }, 'SB-Mid-server-xyz'), false) // amount changed after signing
    assert.equal(verifyMidtrans({ ...body(), order_id: 'INV-2-abc' }, 'SB-Mid-server-xyz'), false)
    assert.equal(verifyMidtrans({ ...body(), signature_key: '' }, 'SB-Mid-server-xyz'), false)
    assert.equal(verifyMidtrans({}, 'SB-Mid-server-xyz'), false)
    assert.equal(verifyMidtrans(body(), ''), false)
  })
  it('only settlement (or an accepted card capture) counts as paid', () => {
    assert.equal(midtransOutcome({ transaction_status: 'settlement' }), 'paid')
    assert.equal(midtransOutcome({ transaction_status: 'capture', fraud_status: 'accept' }), 'paid')
    assert.equal(midtransOutcome({ transaction_status: 'capture', fraud_status: 'challenge' }), 'pending')
    assert.equal(midtransOutcome({ transaction_status: 'pending' }), 'pending')
    for (const s of ['deny', 'cancel', 'expire', 'failure']) assert.equal(midtransOutcome({ transaction_status: s }), 'failed')
    assert.equal(midtransOutcome({ transaction_status: 'something-new' }), 'pending')
  })
})

describe('Xendit notifications', () => {
  it('checks the callback token', () => {
    assert.equal(verifyXendit('cb-token', 'cb-token'), true)
    assert.equal(verifyXendit('cb-tokeX', 'cb-token'), false)
    assert.equal(verifyXendit('', 'cb-token'), false)
    assert.equal(verifyXendit(null, 'cb-token'), false)
    assert.equal(verifyXendit('anything', ''), false)
  })
  it('maps the status', () => {
    assert.equal(xenditOutcome({ status: 'PAID' }), 'paid')
    assert.equal(xenditOutcome({ status: 'settled' }), 'paid')
    assert.equal(xenditOutcome({ status: 'EXPIRED' }), 'failed')
    assert.equal(xenditOutcome({ status: 'PENDING' }), 'pending')
    assert.equal(xenditOutcome({}), 'pending')
  })
})

describe('opening the payment page', () => {
  const input = { orderId: 'INV-1-abc', invoiceNumber: 'INV-1', amount: 150000, customerName: 'Acme', customerEmail: 'a@acme.test', returnUrl: 'https://app.test/invoices/1' }
  const reply = (status, body) => async (url, init) => ({ ok: status < 400, status, json: async () => body, url, init })
  it('Midtrans: sends the amount and the order id with the server key, to the sandbox', async () => {
    let seen
    const f = async (url, init) => ((seen = { url, init }), { ok: true, status: 201, json: async () => ({ token: 't', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/t' }) })
    const { url } = await createCheckout(midtrans, input, f)
    assert.equal(url, 'https://app.sandbox.midtrans.com/snap/v4/redirection/t')
    assert.equal(seen.url, 'https://app.sandbox.midtrans.com/snap/v1/transactions')
    assert.equal(seen.init.headers.authorization, `Basic ${Buffer.from('SB-Mid-server-xyz:').toString('base64')}`)
    const sent = JSON.parse(seen.init.body)
    assert.deepEqual(sent.transaction_details, { order_id: 'INV-1-abc', gross_amount: 150000 })
    assert.equal(sent.callbacks.finish, input.returnUrl)
  })
  it('Midtrans: the live key goes to the live API', async () => {
    let seen
    const live = gatewayConfig({ PAYMENT_PROVIDER: 'midtrans', MIDTRANS_SERVER_KEY: 'Mid-server-live', MIDTRANS_IS_PRODUCTION: 'true' })
    await createCheckout(live, input, async (url) => ((seen = url), { ok: true, status: 201, json: async () => ({ redirect_url: 'x' }) }))
    assert.equal(seen, 'https://app.midtrans.com/snap/v1/transactions')
  })
  it('Xendit: opens an invoice with our reference', async () => {
    let seen
    const f = async (url, init) => ((seen = { url, init }), { ok: true, status: 200, json: async () => ({ invoice_url: 'https://checkout.xendit.co/web/abc' }) })
    const { url } = await createCheckout(xendit, input, f)
    assert.equal(url, 'https://checkout.xendit.co/web/abc')
    assert.equal(seen.url, 'https://api.xendit.co/v2/invoices')
    const sent = JSON.parse(seen.init.body)
    assert.equal(sent.external_id, 'INV-1-abc')
    assert.equal(sent.amount, 150000)
    assert.equal(sent.currency, 'IDR')
  })
  it('explains a refusal', async () => {
    await assert.rejects(createCheckout(midtrans, input, reply(401, { error_messages: ['Access denied due to unauthorized transaction'] })), /Midtrans: Access denied/)
    await assert.rejects(createCheckout(xendit, input, reply(400, { message: 'amount is invalid' })), /Xendit: amount is invalid/)
    await assert.rejects(createCheckout(midtrans, input, reply(500, {})), /could not open the payment page \(500\)/)
  })
})

describe('applying a verified notification', () => {
  const make = (inv) => {
    const calls = { paid: [], cleared: [], notes: [] }
    const deps = {
      findByOrderId: async (id) => (inv && (id === inv.gatewayOrderId || id === 'OTHER') ? inv : null),
      pay: async (id, ref) => {
        if (inv.status !== 'issued') throw new Error('already')
        inv.status = 'paid'
        calls.paid.push([id, ref])
      },
      clearSession: async (id) => void calls.cleared.push(id),
      note: async (id, text) => void calls.notes.push([id, text]),
    }
    return { deps, calls }
  }
  const invoice = (over = {}) => ({ id: 'i1', number: 'INV-1', status: 'issued', total: 150000, gatewayOrderId: 'INV-1-abc', ...over })
  const event = (over = {}) => ({ provider: 'midtrans', orderId: 'INV-1-abc', outcome: 'paid', amount: 150000, reference: 'tx-1', ...over })

  it('pays the invoice when the money is in and the amount matches', async () => {
    const { deps, calls } = make(invoice())
    assert.equal(await handleGatewayEvent(deps, event()), 'paid')
    assert.deepEqual(calls.paid, [['i1', 'tx-1']])
  })
  it('pays only once, however many times the provider repeats itself', async () => {
    const { deps, calls } = make(invoice())
    assert.equal(await handleGatewayEvent(deps, event()), 'paid')
    assert.equal(await handleGatewayEvent(deps, event()), 'already')
    assert.equal(calls.paid.length, 1)
  })
  it('does not settle for less than the invoice says, and writes a note', async () => {
    const { deps, calls } = make(invoice())
    assert.equal(await handleGatewayEvent(deps, event({ amount: 1000 })), 'amount_mismatch')
    assert.equal(await handleGatewayEvent(deps, event({ amount: null })), 'amount_mismatch')
    assert.equal(calls.paid.length, 0)
    assert.equal(calls.notes.length, 2)
  })
  it('accepts a little more than the invoice (fees on top)', async () => {
    const { deps } = make(invoice())
    assert.equal(await handleGatewayEvent(deps, event({ amount: 154000 })), 'paid')
  })
  it('ignores an order id that was not opened for this invoice, or does not exist', async () => {
    const { deps, calls } = make(invoice())
    assert.equal(await handleGatewayEvent(deps, event({ orderId: 'NOPE' })), 'unknown')
    assert.equal(await handleGatewayEvent(deps, event({ orderId: 'OTHER' })), 'unknown') // found, but not the open session of that invoice
    assert.equal(calls.paid.length, 0)
  })
  it('a pending payment changes nothing', async () => {
    const { deps, calls } = make(invoice())
    assert.equal(await handleGatewayEvent(deps, event({ outcome: 'pending' })), 'pending')
    assert.deepEqual(calls, { paid: [], cleared: [], notes: [] })
  })
  it('an expired or failed payment frees the invoice for a new attempt, and leaves a paid one alone', async () => {
    const a = make(invoice())
    assert.equal(await handleGatewayEvent(a.deps, event({ outcome: 'failed', amount: null })), 'failed')
    assert.deepEqual(a.calls.cleared, ['i1'])
    const b = make(invoice({ status: 'paid' }))
    assert.equal(await handleGatewayEvent(b.deps, event({ outcome: 'failed', amount: null })), 'failed')
    assert.deepEqual(b.calls.cleared, [])
  })
  it('money for an invoice that is void is flagged, not settled', async () => {
    const { deps, calls } = make(invoice({ status: 'void' }))
    assert.equal(await handleGatewayEvent(deps, event()), 'already')
    assert.equal(calls.paid.length, 0)
    assert.match(calls.notes[0][1], /void invoice/)
  })
})
