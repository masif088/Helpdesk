import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import InvoiceDocument from '@/components/invoices/InvoiceDocument'
import { getAppSettings } from '@/lib/app-settings'
import { isAdminOrManager } from '@/lib/auth-utils'
import { BRANDING } from '@/lib/branding'
import { customerBillingCompanyId } from '@/lib/customer-billing'
import { companies, get, invoices } from '@/lib/fsdb'
import { companyDepositBalance, invoiceToJson } from '@/lib/invoices'

/**
 * Who may open this invoice: admin / manager, or a client (portal admin) for their own company's invoices,
 * read-only and never a void one.
 */
async function invoiceForViewer(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { denied: 'login' as const }
  const role = (session.user as { role?: string }).role
  const staff = isAdminOrManager(role)
  const clientCompanyId = !staff && role?.toLowerCase() === 'customer' ? await customerBillingCompanyId(session.user.id) : null
  if (!staff && !clientCompanyId) return { denied: 'role' as const }
  const inv = await get(invoices, id)
  if (!inv || (!staff && (inv.companyId !== clientCompanyId || inv.status === 'void'))) return { denied: 'missing' as const }
  return { inv, staff }
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { inv } = await invoiceForViewer((await params).id)
  if (!inv) return {}
  const company = await get(companies, inv.companyId)
  const receipt = (await searchParams).doc === 'receipt'
  // The browser uses the title as the PDF file name
  return { title: { absolute: `${receipt ? inv.number.replace(/^INV/, 'RCT') : inv.number} - ${company?.name ?? 'Invoice'}` } }
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const access = await invoiceForViewer((await params).id)
  if (access.denied === 'login') redirect('/login')
  if (access.denied === 'role') redirect('/dashboard')
  if (!access.inv) notFound()
  const { inv, staff } = access

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
      readOnly={!staff}
    />
  )
}
