import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, AdminContext } from '@/lib/auth/adminMiddleware'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/admin/contracts/[id]/freeze
// Freeze a contract (admin action)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(async (req, auth: AdminContext) => {
    try {
      const { id } = await params
      const body = await request.json()
      const { reason } = body

      if (!reason || reason.trim().length === 0) {
        return NextResponse.json(
          { error: 'Reason is required', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }

      // Fetch the contract
      const contracts = await sql`
        SELECT
          c.id,
          c.status,
          c.project_id,
          c.client_id,
          c.freelancer_id,
          c.total_amount,
          c.currency,
          c.escrow_status,
          c.started_at,
          c.completed_at,
          c.cancelled_at,
          c.cancellation_reason,
          p.title AS project_title,
          u_client.username AS client_username,
          u_freelancer.username AS freelancer_username
        FROM contracts c
        JOIN projects p ON c.project_id = p.id
        JOIN users u_client ON c.client_id = u_client.id
        JOIN users u_freelancer ON c.freelancer_id = u_freelancer.id
        WHERE c.id = ${id}
      `

      if (contracts.length === 0) {
        return NextResponse.json(
          { error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' },
          { status: 404 }
        )
      }

      const contract = contracts[0]

      // Check if contract is already frozen/cancelled
      if (contract.status === 'cancelled') {
        return NextResponse.json(
          { error: 'Contract is already cancelled and cannot be frozen', code: 'INVALID_STATE' },
          { status: 400 }
        )
      }

      if (contract.status === 'paused') {
        return NextResponse.json(
          { error: 'Contract is already frozen', code: 'ALREADY_FROZEN' },
          { status: 400 }
        )
      }

      // Freeze the contract
      const updatedContracts = await sql`
        UPDATE contracts
        SET
          status = 'paused',
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          project_id,
          client_id,
          freelancer_id,
          total_amount,
          currency,
          escrow_status,
          status,
          started_at,
          completed_at,
          cancelled_at,
          cancellation_reason,
          created_at,
          updated_at
      `

      // Also update related project status
      await sql`
        UPDATE projects
        SET status = 'in_progress'
        WHERE id = ${contract.project_id}
          AND status = 'open'
      `

      // Also pause related milestones if they're in progress
      await sql`
        UPDATE milestones
        SET status = 'pending'
        WHERE contract_id = ${id}
          AND status = 'in_progress'
      `

      // Log audit trail
      await sql`
        INSERT INTO admin_audit_logs (
          admin_user_id,
          action,
          target_type,
          target_id,
          details,
          ip_address,
          user_agent
        )
        VALUES (
          ${auth.userId},
          'FREEZE_CONTRACT',
          'contract',
          ${id},
          ${JSON.stringify({
            reason,
            previousStatus: contract.status,
            newStatus: 'paused',
            projectTitle: contract.project_title,
            clientUsername: contract.client_username,
            freelancerUsername: contract.freelancer_username,
            totalAmount: contract.total_amount,
            currency: contract.currency
          })},
          ${req.headers.get('x-forwarded-for') || 'unknown'},
          ${req.headers.get('user-agent') || ''}
        )
      `

      return NextResponse.json({
        success: true,
        message: 'Contract has been frozen successfully',
        data: {
          contract: updatedContracts[0],
          frozenAt: new Date().toISOString(),
          frozenBy: {
            adminId: auth.userId,
            adminWallet: auth.walletAddress
          },
          reason
        }
      }, { status: 200 })

    } catch (error) {
      console.error('Error freezing contract:', error)

      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })(request)
}