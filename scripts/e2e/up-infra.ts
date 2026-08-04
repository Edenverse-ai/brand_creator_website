#!/usr/bin/env tsx
/**
 * Bring up only the infra services (supabase CLI stack + api) — NOT the web
 * container. Use this when you want to run `npm run dev:e2e` against the
 * docker backend. Migrate + seed run from the host with DATABASE_URL pointed
 * at the supabase CLI's host-exposed Postgres port.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { waitForHttp } from "./lib/wait";
import { assertTestDatabaseUrl } from "./lib/assertTestDatabaseUrl";
import { grantServiceRole } from "./grant-service-role";

const COMPOSE = "docker compose -p brand-creator-e2e -f docker/compose.e2e.yml";
const HOST_DB_URL = "postgres://postgres:postgres@localhost:54329/postgres";
const SUPABASE_URL = "http://localhost:54321";
// Supabase CLI's fixed local-dev service_role JWT — identical on every default
// `supabase init` project (signed with the CLI's well-known default JWT
// secret), not a real secret. Printed by `supabase start` / `supabase status`.
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function main() {
  process.env.DATABASE_URL = HOST_DB_URL;
  process.env.DIRECT_URL = HOST_DB_URL;
  assertTestDatabaseUrl(HOST_DB_URL);

  // Postgres + Storage + Auth + REST — idempotent; no-ops if already running.
  console.log("[e2e:up:infra] starting supabase CLI stack…");
  execSync("npx supabase start", { stdio: "inherit" });

  console.log("[e2e:up:infra] starting api…");
  execSync(`${COMPOSE} up -d --wait api`, { stdio: "inherit" });

  console.log("[e2e:up:infra] waiting on http endpoints…");
  await waitForHttp("http://localhost:8001/health", { timeoutMs: 60_000, intervalMs: 1000 });
  await waitForHttp(`${SUPABASE_URL}/rest/v1/`, { timeoutMs: 60_000, intervalMs: 1000 });

  console.log("[e2e:up:infra] running prisma migrate deploy…");
  execSync(`npx prisma migrate deploy`, { stdio: "inherit", env: process.env });

  // See grant-service-role.ts for why this is needed (CLI doesn't
  // auto-expose Prisma-managed tables to PostgREST) and why it's scoped to
  // service_role only. Idempotent/order-independent — safe to share with
  // up.ts and the standalone `npm run dev:grant` entry point.
  console.log("[e2e:up:infra] granting service_role access to Prisma-managed tables…");
  await grantServiceRole(HOST_DB_URL);

  console.log("[e2e:up:infra] creating storage buckets…");
  execSync("node scripts/studio-create-buckets.js", {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_KEY },
  });

  // studio-create-buckets.js's ai-video-tasks default (30MB) is a shared,
  // prod-affecting default — bump it locally to match OUTPUT_MAX_BYTES
  // (src/lib/ai-video-task.ts) without touching that shared script.
  console.log("[e2e:up:infra] raising ai-video-tasks bucket limit to match OUTPUT_MAX_BYTES…");
  const prisma = new PrismaClient({ datasources: { db: { url: HOST_DB_URL } } });
  await prisma.$executeRawUnsafe(
    `UPDATE storage.buckets SET file_size_limit = 209715200 WHERE id = 'ai-video-tasks'`
  );
  await prisma.$disconnect();

  console.log("[e2e:up:infra] seeding…");
  execSync(`npx tsx prisma/seed.e2e.ts`, { stdio: "inherit", env: process.env });

  console.log("[e2e:up:infra] ready.");
  console.log("");
  console.log("Next:");
  console.log("  npx dotenv -e .env.e2e-dev -o -- npm run dev");
  console.log("  open http://localhost:12000");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
