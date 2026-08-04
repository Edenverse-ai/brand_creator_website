#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { waitForHttp } from "./lib/wait";

const COMPOSE = "docker compose -p brand-creator-e2e -f docker/compose.e2e.yml";
const SUPABASE_URL = "http://localhost:54321";
// Supabase CLI's fixed local-dev service_role JWT — identical on every default
// `supabase init` project (signed with the CLI's well-known default JWT
// secret), not a real secret. Printed by `supabase start` / `supabase status`.
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export function assertTestDatabaseUrl(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL must be set");
  if (!url.includes(":54329/")) {
    throw new Error(
      `refusing to operate against non-test DATABASE_URL: ${url}. Expected port :54329`
    );
  }
}

async function main() {
  const dbUrl = "postgres://postgres:postgres@localhost:54329/postgres";
  process.env.DATABASE_URL = dbUrl;
  assertTestDatabaseUrl(dbUrl);

  // Postgres + Storage + Auth + REST — idempotent; no-ops if already running.
  console.log("[e2e:up] starting supabase CLI stack…");
  execSync("npx supabase start", { stdio: "inherit" });

  console.log("[e2e:up] starting api + web…");
  execSync(`${COMPOSE} up -d --wait`, { stdio: "inherit" });

  console.log("[e2e:up] waiting on http endpoints…");
  await waitForHttp("http://localhost:8001/health", {
    timeoutMs: 60_000,
    intervalMs: 1000,
  });
  await waitForHttp("http://localhost:12001/", {
    timeoutMs: 60_000,
    intervalMs: 1000,
  });

  // Run migrate + seed inside the web container so the repo-root .env cannot
  // override DATABASE_URL with the production Supabase URL (the container
  // image never has a .env file baked in, so there's nothing to leak).
  const pgInternal = "postgres://postgres:postgres@localhost:54329/postgres";
  const dbEnv = `DATABASE_URL=${pgInternal} DIRECT_URL=${pgInternal}`;

  console.log("[e2e:up] running prisma migrate deploy…");
  execSync(`${COMPOSE} exec -T web sh -c "${dbEnv} npx prisma migrate deploy"`, {
    stdio: "inherit",
  });

  // All app tables are created by Prisma (as the `postgres` role), not through
  // Supabase's own migration flow, so the CLI's default posture — new tables
  // are NOT auto-exposed to Data API roles without explicit GRANTs — leaves
  // service_role unable to query them via PostgREST (used by the FastAPI
  // sidecar's supabase-py client, e.g. app/main/services/brand_service.py).
  // `auto_expose_new_tables = true` in config.toml would restore the old
  // auto-grant behavior, but that flag is explicitly deprecated for removal
  // on 2026-10-30 — so grant service_role directly instead, which keeps
  // working regardless of CLI version. Scoped to service_role only (the only
  // role this app's Supabase/PostgREST code paths ever use — anon/authenticated
  // are never used, so are deliberately not granted broad table access, e.g.
  // to User.password). Safe to run from the host: DATABASE_URL is guarded by
  // assertTestDatabaseUrl above.
  console.log("[e2e:up] granting service_role access to Prisma-managed tables…");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO service_role`);
  await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`);
  await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role`);
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role`
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role`
  );

  console.log("[e2e:up] creating storage buckets…");
  execSync("node scripts/studio-create-buckets.js", {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_KEY },
  });

  // studio-create-buckets.js's ai-video-tasks default (30MB) is a shared,
  // prod-affecting default — bump it locally to match OUTPUT_MAX_BYTES
  // (src/lib/ai-video-task.ts) without touching that shared script.
  console.log("[e2e:up] raising ai-video-tasks bucket limit to match OUTPUT_MAX_BYTES…");
  await prisma.$executeRawUnsafe(
    `UPDATE storage.buckets SET file_size_limit = 209715200 WHERE id = 'ai-video-tasks'`
  );
  await prisma.$disconnect();

  console.log("[e2e:up] seeding…");
  execSync(`${COMPOSE} exec -T web sh -c "${dbEnv} npx tsx prisma/seed.e2e.ts"`, {
    stdio: "inherit",
  });

  console.log("[e2e:up] ready.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
