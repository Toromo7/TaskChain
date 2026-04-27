import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, AdminContext } from '@/lib/auth/adminMiddleware'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/admin/disputes
export async function GET(request: NextRequest) {
  return withAdmin(async (request, auth: AdminContext) => {
    try {
      const { searchParams } = new URL(request.url)

      const status = searchParams.get('status')
      const raisedBy = searchParams.get('raisedBy')
      const page = parseInt(searchParams.get('page') || '1')
      const pageSize = parseInt(searchParams.get('limit') || '10')
      const offset = (page - 1) * pageSize

      const conditions: any[] = []

      if (status) {
        conditions.push(sql`d.status = ${status}`)
      }

      if (raisedBy) {
        conditions.push(sql`d.raised_by = ${raisedBy}`)
      }

      const where =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``

      // Fetch disputes
      const disputes = await sql`
        SELECT
          d.id,
          d.contract_id,
          d.milestone_id,
          d.raised_by,
          d.raised_by_user_id,
          u_raiser.wallet_address AS raised_by_wallet,
          u_raiser.username AS raised_by_username,
          d.reason,
          d.desired_outcome,
          d.evidence,
          d.status,
          d.resolver_id,
          u_resolver.wallet_address AS resolver_wallet,
          u_resolver.username AS resolver_username,
          d.resolution_notes,
          d.resolved_at,
          d.response_deadline,
          d.created_at,
          d.updated_at,
          c.title AS contract_title,
          c.status AS contract_status,
          m.title AS milestone_title
        FROM disputes d
        JOIN users u_raiser ON d.raised_by_user_id = u_raiser.id
        LEFT JOIN users u_resolver ON d.resolver_id = u_resolver.id
        JOIN contracts c ON d.contract_id = c.id
        LEFT JOIN milestones m ON d.milestone_id = m.id
        ${where}
        ORDER BY d.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `

      // Count query
      const countResult = await sql`
        SELECT COUNT(*) AS total
        FROM disputes d
        ${where}
      `

      const total = Number(countResult[0]?.total || 0)
      
      // Audit log
      await sql`
        INSERT INTO admin_audit_logs (
          admin_user_id,
          action,
          details,
          ip_address,
          user_agent
        )
        VALUES (
          ${auth.userId},
          'VIEW_DISPUTES',
          ${JSON.stringify({
            filters: { status, raisedBy, page, limit: pageSize },
            resultsReturned: disputes.length
          })},
          ${request.headers.get('x-forwarded-for') || 'unknown'},
          ${request.headers.get('user-agent') || ''}
        )
      `

      return NextResponse.json({
        disputes,
        pagination: {
          total,
          page,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      })
    } catch (error) {
      console.error('Error fetching disputes:', error)

      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  })(request)
}