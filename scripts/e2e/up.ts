#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { waitForHttp } from "./lib/wait";
import { assertTestDatabaseUrl } from "./lib/assertTestDatabaseUrl";
import { grantServiceRole } from "./grant-service-role";

// Re-exported for backward compatibility: tests/harness-e2e/up-guardrail.test.ts
// and other scripts in this directory import it from here. Canonical home is
// ./lib/assertTestDatabaseUrl.ts.
export { assertTestDatabaseUrl };

const COMPOSE = "docker compose -p brand-creator-e2e -f docker/compose.e2e.yml";
const SUPABASE_URL = "http://localhost:54321";
// Supabase CLI's fixed local-dev service_role JWT — identical on every default
// `supabase init` project (signed with the CLI's well-known default JWT
// secret), not a real secret. Printed by `supabase start` / `supabase status`.
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function main() {
  const dbUrl = "postgres://postgres:postgres@localhost:54329/postgres";
  process.env.DATABASE_URL = dbUrl;
  assertTestDatabaseUrl(dbUrl);

  // Postgres + Storage + Auth + REST — idempotent; no-ops if already running.
  console.log("[e2e:up] starting supabase CLI stack…");
  execSync("npx supabase start", { stdio: "inherit" });

  console.log("[e2e:up] starting web…");
  execSync(`${COMPOSE} up -d --wait`, { stdio: "inherit" });

  console.log("[e2e:up] waiting on http endpoints…");
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

  // See grant-service-role.ts for why this is needed (CLI doesn't
  // auto-expose Prisma-managed tables to PostgREST) and why it's scoped to
  // service_role only. Idempotent/order-independent — safe to share with
  // up-infra.ts and the standalone `npm run dev:grant` entry point.
  console.log("[e2e:up] granting service_role access to Prisma-managed tables…");
  await grantServiceRole(dbUrl);

  console.log("[e2e:up] creating storage buckets…");
  execSync("node scripts/studio-create-buckets.js", {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_KEY },
  });

  // studio-create-buckets.js's ai-video-tasks default (30MB) is a shared,
  // prod-affecting default — bump it locally to match OUTPUT_MAX_BYTES
  // (src/lib/ai-video-task.ts) without touching that shared script. Safe to
  // run from the host: DATABASE_URL is guarded by assertTestDatabaseUrl above.
  console.log("[e2e:up] raising ai-video-tasks bucket limit to match OUTPUT_MAX_BYTES…");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
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
