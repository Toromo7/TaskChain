import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ id: string }> }

export const PATCH = withAuth(async (request: NextRequest, auth, context: RouteContext) => {
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
    const { contractId, contractState } = body

    if (!contractState) {
      return NextResponse.json(
        { error: 'Missing required field: contractState', code: 'MISSING_FIELDS' },
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

    const [dispute] = await sql`SELECT id FROM disputes WHERE id = ${disputeId}`
    if (!dispute) {
      return NextResponse.json(
        { error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' },
        { status: 404 }
      )
    }

    const [updated] = await sql`
      UPDATE disputes 
      SET contract_id = ${contractId || null}, contract_state = ${contractState}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${disputeId}
      RETURNING *
    `

    return NextResponse.json(updated, { status: 200 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to update contract state', code: 'CONTRACT_UPDATE_FAILED' },
      { status: 500 }
    )
  }
})