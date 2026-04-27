/**
 * lib/db.ts
 *
 * Single shared Neon HTTP client for all API routes.
 *
 * Why HTTP (neon) and not Pool?
 *   Next.js API routes run in a serverless/edge context where TCP connections
 *   cannot be held open between requests. The HTTP driver is the correct
 *   choice here — each tagged-template call is a single round-trip with no
 *   connection state. For the migration script (a long-lived Node process)
 *   we use Pool + WebSockets instead (see scripts/migrate.ts).
 *
 * Connection caching:
 *   `fetchConnectionCache: true` tells the Neon driver to reuse the
 *   underlying fetch connection across calls within the same serverless
 *   invocation (warm lambda / Next.js route handler). This meaningfully
 *   reduces latency on the multi-query "Confirm & Deploy" flow which hits
 *   the DB several times in sequence (auth check → job lookup → contract
 *   insert → milestone inserts).
 */

import { neon, neonConfig } from '@neondatabase/serverless'

// Reuse fetch connections within a single serverless invocation.
neonConfig.fetchConnectionCache = true

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  const message =
    'DATABASE_URL is not set.\n' +
    '  • Local dev  : copy env.example → .env.local and add your Neon connection string.\n' +
    '  • Production : set DATABASE_URL in your Railway environment variables.\n' +
    '  Format       : postgres://user:pass@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require'

  if (process.env.NODE_ENV === 'production') {
    // Hard crash at startup — a production deployment without a DB URL is always wrong.
    throw new Error(message)
  } else {
    // Soft warn during local `next build` so static pages can still be generated.
    console.warn(`\n⚠️  ${message}\n`)
  }
}

// Passing an empty string is safe during static builds — neon() only
// establishes a connection when a query is actually executed.
export const sql = neon(databaseUrl ?? '')
