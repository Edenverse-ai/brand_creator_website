import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const TEST_DB = "postgres://postgres:postgres@localhost:54329/postgres";
let prisma: PrismaClient;

// NOTE: Schema corrections applied vs task template:
// - `prisma.campaign`  → `prisma.campaigns`  (model name is lowercase plural `campaigns`)
// - `prisma.sample`    → kept as `prisma.sample`  (model name is PascalCase `Sample`)
// - campaigns.id is @db.Uuid — stable ID uses UUID-format: "00000000-0000-0000-0000-e2e000000001"
describe.runIf(process.env.E2E_DB === "1")("seed.e2e.ts", () => {
  beforeAll(async () => {
    // schema.prisma's datasource declares directUrl = env("DIRECT_URL"), which
    // `prisma migrate deploy` uses instead of DATABASE_URL — without setting it
    // too, migrate deploy falls back to .env's production DIRECT_URL.
    process.env.DATABASE_URL = TEST_DB;
    process.env.DIRECT_URL = TEST_DB;
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
    execSync("npx tsx prisma/seed.e2e.ts", { stdio: "inherit", env: process.env });
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates brand@e2e.test, creator@e2e.test, admin@e2e.test", async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: ["brand@e2e.test", "creator@e2e.test", "admin@e2e.test"] } },
      orderBy: { email: "asc" },
    });
    expect(users.map((u) => u.email)).toEqual([
      "admin@e2e.test",
      "brand@e2e.test",
      "creator@e2e.test",
    ]);
  });

  it("creates exactly 1 campaign and 1 sample with stable IDs", async () => {
    // campaigns model → prisma.campaigns; Sample model → prisma.sample
    const campaigns = await prisma.campaigns.findMany();
    const samples = await prisma.sample.findMany();
    expect(campaigns).toHaveLength(1);
    expect(samples).toHaveLength(1);
    // campaigns.id is @db.Uuid; stable UUID chosen for "e2e-campaign-1" contract
    expect(campaigns[0].id).toBe("00000000-0000-0000-0000-e2e000000001");
    expect(samples[0].id).toBe("e2e-sample-1");
  });
});
