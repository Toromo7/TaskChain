import { NextRequest, NextResponse } from 'next/server'
import { signSessionToken } from '@/lib/auth/jwt'
import { setSessionCookies } from '@/lib/auth/session'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '@/lib/auth/constants'
import { randomId, sha256Hex } from '@/lib/auth/crypto'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ─── Dev-only mock auth route ─────────────────────────────────────────────────
// Issues a real JWT session for a fake Stellar address so you can test the
// full DB + dashboard flow without a real wallet.
//
// Bypasses storeRefreshToken (which requires auth_refresh_tokens to be seeded)
// and instead writes the token directly — making it resilient to DB state.
//
// ONLY available when NODE_ENV !== 'production'. Returns 404 in production.

const MOCK_WALLET = 'GMOCKUSER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is not set or is too short (min 32 chars). Check your .env file.'
    )
  }
  return secret
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Surface JWT_SECRET problems immediately with a clear message
  let secret: string
  try {
    secret = getSecret()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'JWT_SECRET error' },
      { status: 500 }
    )
  }

  const now = Math.floor(Date.now() / 1000)

  // Sign access token (15 min)
  const { token: accessToken, payload: accessPayload } = signSessionToken({
    subject: MOCK_WALLET,
    walletAddress: MOCK_WALLET,
    type: 'access',
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    secret,
  })

  // Sign refresh token (7 days)
  const { token: refreshToken, payload: refreshPayload } = signSessionToken({
    subject: MOCK_WALLET,
    walletAddress: MOCK_WALLET,
    type: 'refresh',
    expiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
    secret,
  })

  // Persist refresh token to DB (best-effort — don't fail mock login if this errors)
  try {
    await sql`
      INSERT INTO auth_refresh_tokens
        (wallet_address, jti, token_hash, expires_at, user_agent, ip_address)
      VALUES (
        ${MOCK_WALLET},
        ${refreshPayload.jti},
        ${sha256Hex(refreshToken)},
        ${new Date(refreshPayload.exp * 1000).toISOString()},
        ${request.headers.get('user-agent')},
        ${request.headers.get('x-forwarded-for') ?? null}
      )
      ON CONFLICT (jti) DO NOTHING
    `
  } catch (dbErr) {
    // Log but don't block — the access token is self-contained and sufficient
    // for testing the project creation flow.
    console.warn('[mock auth] Could not persist refresh token:', dbErr)
  }

  const session = {
    walletAddress: MOCK_WALLET,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(accessPayload.exp * 1000),
    refreshTokenExpiresAt: new Date(refreshPayload.exp * 1000),
    refreshJti: refreshPayload.jti,
  }

  const response = NextResponse.json(
    {
      walletAddress: MOCK_WALLET,
      mock: true,
      accessToken,                                      // exposed so client can set header if cookies fail
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    },
    { status: 200 }
  )

  setSessionCookies(response, session)
  return response
}
