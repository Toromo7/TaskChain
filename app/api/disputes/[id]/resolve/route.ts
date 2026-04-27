import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }

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
    const { resolution, newState } = body

    if (!resolution) {
      return NextResponse.json(
        { error: 'Missing required field: resolution', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress}`
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    const [dispute] = await sql`
      SELECT d.*, j.escrow_contract_id
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      WHERE d.id = ${disputeId}
    `
    if (!dispute) {
      return NextResponse.json(
        { error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' },
        { status: 404 }
      )
    }

    const previousState = dispute.contract_state || 'disputed'
    const nextState = newState || 'resolved'

    await sql`
      UPDATE disputes 
      SET contract_state = ${nextState}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId}
    `

    const [log] = await sql`
      INSERT INTO dispute_resolution_log (dispute_id, contract_id, previous_state, new_state, resolution, resolved_by)
      VALUES (${disputeId}, ${dispute.escrow_contract_id || null}, ${previousState}, ${nextState}, ${resolution}, ${user.id})
      RETURNING *
    `

    await sql`UPDATE jobs SET escrow_status = ${nextState}, updated_at = CURRENT_TIMESTAMP WHERE id = ${dispute.job_id}`

    return NextResponse.json({ message: 'Dispute resolved', log }, { status: 200 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve dispute', code: 'RESOLVE_FAILED' },
      { status: 500 }
    )
  }
})