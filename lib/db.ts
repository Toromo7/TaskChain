import { neon, neonConfig } from '@neondatabase/serverless'

// fetchConnectionCache is now always true in newer versions of the driver
// (the option is deprecated but harmless to set)
neonConfig.fetchConnectionCache = true

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  // Only warn at module load time — never throw.
  // Throwing here crashes the entire Next.js build because every API route
  // imports this module, and Next.js evaluates all route modules during
  // `next build` even when force-dynamic is set.
  // The actual error will surface naturally when a query is attempted at
  // runtime without a DATABASE_URL configured.
  console.warn(
    '\n⚠️  DATABASE_URL is not set.\n' +
    '  • Local dev  : copy env.example → .env.local and add your Neon connection string.\n' +
    '  • Production : set DATABASE_URL in your Railway / hosting environment variables.\n' +
    '  Format       : postgres://user:pass@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require\n'
  )
}

// neon('') is safe to import — it only throws when a query is executed.
export const sql = neon(databaseUrl ?? '')
