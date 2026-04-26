import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params
  const disputeId = Number.parseInt(id, 10)

  if (!Number.isFinite(disputeId) || disputeId < 1) {
    return NextResponse.json(
      { error: 'Invalid dispute id', code: 'INVALID_DISPUTE_ID' },
      { status: 400 }
    )
  }

  try {
    const [dispute] = await sql`
      SELECT d.*, j.title as job_title, j.escrow_contract_id,
             u.username as raised_by_username, u.wallet_address as raised_by_wallet
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      JOIN users u ON d.raised_by = u.id
      WHERE d.id = ${disputeId}
    `

    if (!dispute) {
      return NextResponse.json(
        { error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' },
        { status: 404 }
      )
    }

    const evidence = await sql`SELECT * FROM dispute_evidence WHERE dispute_id = ${disputeId} ORDER BY created_at DESC`
    const comments = await sql`
      SELECT dc.*, u.username as author_username
      FROM dispute_comments dc
      JOIN users u ON dc.author_id = u.id
      WHERE dc.dispute_id = ${disputeId}
      ORDER BY dc.created_at ASC
    `

    return NextResponse.json({ ...dispute, evidence, comments }, { status: 200 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch dispute', code: 'DISPUTE_DETAILS_FAILED' },
      { status: 500 }
    )
  }
})

export const POST = withAuth(async (request: NextRequest, auth, context: RouteContext) => {
  const { id } = await context.params
  const disputeId = Number.parseInt(id, 10)

  if (!Number.isFinite(disputeId) || disputeId < 1) {
    return NextResponse.json(
      { error: 'Invalid dispute id', code: 'INVALID_DISPUTE_ID' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const { resolution, status, contractState } = body

    if (!resolution || !status) {
      return NextResponse.json(
        { error: 'Missing required fields', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const [dispute] = await sql`
      UPDATE disputes 
      SET status = ${status}, resolution = ${resolution},
          resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId}
      RETURNING *
    `

    if (!dispute) {
      return NextResponse.json(
        { error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' },
        { status: 404 }
      )
    }

    if (contractState) {
      await sql`UPDATE jobs SET escrow_status = ${contractState}, updated_at = CURRENT_TIMESTAMP WHERE id = ${dispute.job_id}`
    }

    return NextResponse.json(dispute, { status: 200 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve dispute', code: 'DISPUTE_RESOLUTION_FAILED' },
      { status: 500 }
    )
  }
})