import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { sendInvoiceEmail } from '@/lib/invoice-email'
import { companyName, InvoiceError, invoiceToJson } from '@/lib/invoices'

/** POST /api/invoices/[id]/send { doc: 'invoice' | 'receipt', to, subject, message } — admin / manager */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as { doc?: string; to?: unknown; subject?: unknown; message?: unknown }
  try {
    const row = await sendInvoiceEmail({ invoiceId: (await params).id, doc: b.doc === 'receipt' ? 'receipt' : 'invoice', to: b.to, subject: b.subject, message: b.message })
    return NextResponse.json(invoiceToJson(row, await companyName(row.companyId)))
  } catch (e) {
    if (e instanceof InvoiceError) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('[invoices/send]', e)
    return NextResponse.json({ error: 'The email could not be sent' }, { status: 502 })
  }
}
