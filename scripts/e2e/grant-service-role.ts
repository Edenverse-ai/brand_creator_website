#!/usr/bin/env tsx
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl } from "./lib/assertTestDatabaseUrl";

const LOCAL_DB_URL = "postgres://postgres:postgres@localhost:54329/postgres";

/**
 * Grants service_role access to Prisma-managed tables in the public schema.
 *
 * All app tables are created by Prisma (as the `postgres` role), not through
 * Supabase's own migration flow, so the CLI's default posture — new tables
 * are NOT auto-exposed to Data API roles without explicit GRANTs — leaves
 * service_role unable to query them via PostgREST (used by the FastAPI
 * sidecar's supabase-py client, e.g. app/main/services/brand_service.py).
 * `auto_expose_new_tables = true` in supabase/config.toml would restore the
 * old auto-grant behavior, but that flag is explicitly deprecated for
 * removal on 2026-10-30 — so grant service_role directly instead, which
 * keeps working regardless of CLI version. Scoped to service_role only (the
 * only role this app's Supabase/PostgREST code paths ever use —
 * anon/authenticated are never used, so are deliberately not granted broad
 * table access, e.g. to User.password).
 *
 * Idempotent (GRANT and ALTER DEFAULT PRIVILEGES are no-ops on repeat), and
 * order-independent relative to migrations: the immediate GRANTs cover
 * tables that already exist, and ALTER DEFAULT PRIVILEGES covers tables
 * Prisma creates afterward — so it's safe to call this before or after
 * `prisma migrate deploy`.
 *
 * Self-guards via assertTestDatabaseUrl so every caller — scripts/e2e/up.ts,
 * scripts/e2e/up-infra.ts, and the standalone `npm run dev:grant` entry
 * point (chained from `dev:migrate` so the brief's documented
 * `supabase start` -> `dev:migrate && dev:seed` sequence works unmodified on
 * a cold Postgres volume) — is equally protected, not just the ones that
 * happen to guard before calling in.
 */
export async function grantServiceRole(dbUrl: string): Promise<void> {
  assertTestDatabaseUrl(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO service_role`);
    await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`);
    await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role`);
    await prisma.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role`
    );
    await prisma.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role`
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  await grantServiceRole(LOCAL_DB_URL);
  console.log("[e2e:grant] service_role granted access to public-schema tables.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
