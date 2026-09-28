import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import InvoiceDocument from '@/components/invoices/InvoiceDocument'
import { getAppSettings } from '@/lib/app-settings'
import { isAdminOrManager } from '@/lib/auth-utils'
import { BRANDING } from '@/lib/branding'
import { companies, get, invoices } from '@/lib/fsdb'
import { companyDepositBalance, invoiceToJson } from '@/lib/invoices'

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const inv = await get(invoices, (await params).id)
  if (!inv) return {}
  const company = await get(companies, inv.companyId)
  const receipt = (await searchParams).doc === 'receipt'
  // The browser uses the title as the PDF file name
  return { title: { absolute: `${receipt ? inv.number.replace(/^INV/, 'RCT') : inv.number} - ${company?.name ?? 'Invoice'}` } }
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')

  const inv = await get(invoices, (await params).id)
  if (!inv) notFound()
  const [company, settings, balance] = await Promise.all([
    get(companies, inv.companyId),
    getAppSettings(),
    companyDepositBalance(inv.companyId, inv.id),
  ])

  return (
    <InvoiceDocument
      invoice={invoiceToJson(inv, company?.name ?? null)}
      client={{ name: company?.name ?? 'Deleted company', email: company?.email ?? null }}
      issuer={{
        name: settings.app_name,
        markUrl: settings.app_favicon_url || BRANDING.favicon,
        details: settings.invoice_issuer,
        paymentInfo: settings.invoice_payment_info,
        footer: settings.invoice_footer,
      }}
      depositAvailable={balance.get(inv.currency) ?? 0}
      initialDoc={(await searchParams).doc === 'receipt' && inv.status === 'paid' ? 'receipt' : 'invoice'}
    />
  )
}
