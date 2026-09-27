import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyDatas, upsert } from '@/lib/fsdb'

/** POST /api/companies/[id]/company-datas - upsert company data fields */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { datas } = body

  if (!id) {
    return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
  }

  if (!Array.isArray(datas)) {
    return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
  }

  const dataToUpsert = datas.filter(
    (item: { value?: unknown }) =>
      item.value !== null && item.value !== undefined && String(item.value).trim() !== ''
  ).map((item: { data_template_id: string; value: string }) => ({
    companyId: id,
    dataTemplateId: item.data_template_id,
    value: item.value,
  }))

  if (dataToUpsert.length === 0) {
    return NextResponse.json({ message: 'No valid data to save' }, { status: 200 })
  }

  const results: unknown[] = []
  for (const item of dataToUpsert) {
    const saved = await upsert(
      companyDatas,
      { companyId: item.companyId, dataTemplateId: item.dataTemplateId, value: item.value },
      { value: item.value, updatedAt: new Date() }
    )
    results.push(saved)
  }

  return NextResponse.json({
    success: true,
    data: results,
    message: `${results.length} data fields saved successfully`,
  })
}
