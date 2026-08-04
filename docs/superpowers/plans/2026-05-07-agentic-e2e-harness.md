# Agentic E2E Harness Implementation Plan

> **Superseded by Phase 6** (`docs/superpowers/plans/2026-08-04-infra-simplification.md`, `.superpowers/sdd/phase-6-report.md`): the hand-rolled `pg` + `supabase` (storage-api) + nginx proxy stack this plan describes was replaced by the official Supabase CLI (`supabase/config.toml`, `npx supabase start`). Ports (54330/54331) and credentials (`e2e:e2e`/`brand_creator_e2e`) below no longer apply — current values are `54321` (Supabase API) / `54329` (Postgres, `postgres:postgres`). Left unmodified below as a historical record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Playwright-based E2E harness an LLM agent can drive: docker-compose stack boot, deterministic DB seed, role-scoped storageState auth, agent-friendly TDD/explore/debug wrappers.

**Architecture:** `docker/compose.e2e.yml` boots `pg + supabase + api + web`. `scripts/e2e/{up,down,agent,explore,debug,reset-db}.ts` wrap orchestration. `prisma/seed.e2e.ts` provides deterministic fixtures. `e2e/_setup/global-setup.ts` builds `.e2e/auth/<role>.json` storageState files. `agent.ts` runs Playwright with JSON reporter and emits `.e2e/runs/<id>/summary.md` for the agent to read. Spec source: `docs/superpowers/specs/2026-05-07-agentic-e2e-harness-design.md`.

**Tech Stack:** TypeScript, tsx, Playwright, Docker Compose, Postgres 16, FastAPI, Next.js 15, Prisma 6, Vitest, NextAuth credentials provider.

---

## File Structure

**Created (in order written):**

```
.gitignore                                       # append .e2e/
docker/compose.e2e.yml                           # 4-service stack
docker/Dockerfile.web                            # next build + start
backend/Dockerfile                               # uvicorn FastAPI (verify or add)
prisma/seed.e2e.ts                               # deterministic fixture
scripts/e2e/reset-db.ts                          # truncate + reseed CLI
scripts/e2e/lib/wait.ts                          # health wait helper
scripts/e2e/lib/runId.ts                         # epoch ms
scripts/e2e/lib/summary.ts                       # build summary.md from report.json
scripts/e2e/up.ts                                # boot
scripts/e2e/down.ts                              # teardown
scripts/e2e/agent.ts                             # TDD wrapper
scripts/e2e/explore.ts                           # MCP boot
scripts/e2e/debug.ts                             # post-mortem
src/app/api/test/login/route.ts                  # gated test login
e2e/_setup/global-setup.ts                       # storageState builder
e2e/_setup/global-teardown.ts                    # noop placeholder
e2e/_helpers/resetDb.ts                          # in-test reset fixture
e2e/_helpers/fixtures.ts                         # asBrand/asCreator/asAdmin
e2e/_helpers/probes.ts                           # debug-mode probe registry
e2e/brand/campaign-create.spec.ts                # representative feature TDD test
.github/workflows/e2e.yml                        # CI
docs/e2e.md                                      # operator guide
tests/harness-e2e/summary.test.ts                # vitest for summary.ts
tests/harness-e2e/wait.test.ts                   # vitest for wait.ts
tests/harness-e2e/runId.test.ts                  # vitest for runId.ts
tests/harness-e2e/up-guardrail.test.ts           # vitest for DATABASE_URL guard
tests/harness-e2e/compose.test.ts                # vitest for compose syntax
tests/harness-e2e/seed.test.ts                   # vitest for seed fixture (E2E_DB=1)
tests/harness-e2e/resetDb.test.ts                # vitest for resetDb helper
tests/harness-e2e/test-login.test.ts             # vitest for /api/test/login gate
```

**Modified:**

```
package.json                                     # scripts + tsx dep
playwright.config.ts                             # E2E_AGENT branch + globalSetup
docs/harness.md                                  # link to e2e.md
```

---

## Task 1: Project bootstrap — deps, gitignore, runtime dir

**Files:**

- Modify: `.gitignore`
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Append `.e2e/` to `.gitignore`**

```
# E2E harness runtime artifacts
.e2e/
```

- [ ] **Step 2: Install tsx + dotenv-cli + @types/node-fetch as devDeps**

Run: `npm install --save-dev tsx dotenv-cli @types/node-fetch`
Expected: deps added to `package.json`.

- [ ] **Step 3: Verify install**

Run: `npx tsx --version`
Expected: prints tsx version (e.g., `4.x.x`).

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore(e2e): add tsx tooling and gitignore .e2e/"
```

---

## Task 2: Compose stack — `docker/compose.e2e.yml`

**Files:**

- Create: `docker/compose.e2e.yml`
- Create: `tests/harness-e2e/compose.test.ts`

- [ ] **Step 1: Write failing config-validity test**

Create `tests/harness-e2e/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("docker/compose.e2e.yml", () => {
  it("is valid compose syntax", () => {
    expect(() =>
      execSync("docker compose -f docker/compose.e2e.yml config", {
        stdio: "pipe",
      })
    ).not.toThrow();
  });

  it("declares pg, supabase, api, web services", () => {
    const out = execSync("docker compose -f docker/compose.e2e.yml config --services", {
      encoding: "utf8",
    });
    const services = out.trim().split("\n").sort();
    expect(services).toEqual(["api", "pg", "supabase", "web"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/compose.test.ts`
Expected: FAIL — `docker/compose.e2e.yml` not found.

- [ ] **Step 3: Write `docker/compose.e2e.yml`**

```yaml
name: brand-creator-e2e

services:
  pg:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: e2e
      POSTGRES_PASSWORD: e2e
      POSTGRES_DB: brand_creator_e2e
    ports: ["54329:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U e2e -d brand_creator_e2e"]
      interval: 2s
      timeout: 3s
      retries: 30
    volumes:
      - pgdata:/var/lib/postgresql/data

  supabase:
    image: supabase/storage-api:v1.11.13
    depends_on:
      pg: { condition: service_healthy }
    environment:
      ANON_KEY: e2e-anon-key
      SERVICE_KEY: e2e-service-key
      POSTGREST_URL: http://pg:5432
      PGRST_JWT_SECRET: e2e-jwt-secret-32chars-long-min-len
      DATABASE_URL: postgres://e2e:e2e@pg:5432/brand_creator_e2e
      FILE_SIZE_LIMIT: "52428800"
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: e2e
      REGION: local
      GLOBAL_S3_BUCKET: e2e
    ports: ["54330:5000"]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:5000/status"]
      interval: 3s
      timeout: 3s
      retries: 30
    volumes:
      - storage:/var/lib/storage

  api:
    build:
      context: ../backend
      dockerfile: Dockerfile
    depends_on:
      pg: { condition: service_healthy }
    environment:
      DATABASE_URL: postgres://e2e:e2e@pg:5432/brand_creator_e2e
      SUPABASE_URL: http://supabase:5000
      SUPABASE_SERVICE_KEY: e2e-service-key
      ENV: e2e
    ports: ["8001:8000"]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8000/health"]
      interval: 3s
      timeout: 3s
      retries: 30

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
    depends_on:
      api: { condition: service_healthy }
    environment:
      DATABASE_URL: postgres://e2e:e2e@pg:5432/brand_creator_e2e
      NEXTAUTH_URL: http://localhost:12001
      NEXTAUTH_SECRET: e2e-nextauth-secret-not-prod
      NEXT_PUBLIC_API_URL: http://localhost:8001
      SUPABASE_URL: http://localhost:54330
      SUPABASE_SERVICE_KEY: e2e-service-key
      E2E_EXPLORE: ${E2E_EXPLORE:-0}
    ports: ["12001:3000"]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/"]
      interval: 5s
      timeout: 5s
      retries: 60

volumes:
  pgdata:
  storage:
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/compose.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add docker/compose.e2e.yml tests/harness-e2e/compose.test.ts
git commit -m "feat(e2e): add compose.e2e.yml stack"
```

---

## Task 3: `docker/Dockerfile.web`

**Files:**

- Create: `docker/Dockerfile.web`

- [ ] **Step 1: Write failing build-check test**

Append to `tests/harness-e2e/compose.test.ts`:

```ts
it("Dockerfile.web parses (docker build --check)", () => {
  expect(() =>
    execSync("docker build --check -f docker/Dockerfile.web .", { stdio: "pipe" })
  ).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/compose.test.ts -t "Dockerfile.web"`
Expected: FAIL.

- [ ] **Step 3: Write `docker/Dockerfile.web`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache wget
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/compose.test.ts -t "Dockerfile.web"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docker/Dockerfile.web tests/harness-e2e/compose.test.ts
git commit -m "feat(e2e): add web Dockerfile for compose stack"
```

---

## Task 4: `backend/Dockerfile`

**Files:**

- Create or verify: `backend/Dockerfile`

- [ ] **Step 1: Check if exists**

Run: `test -f backend/Dockerfile && echo EXISTS || echo MISSING`

If `EXISTS`, skip to Step 5. Else continue.

- [ ] **Step 2: Append failing test**

Append to `tests/harness-e2e/compose.test.ts`:

```ts
it("backend/Dockerfile parses", () => {
  expect(() =>
    execSync("docker build --check -f backend/Dockerfile backend", { stdio: "pipe" })
  ).not.toThrow();
});
```

Run: `npx vitest run tests/harness-e2e/compose.test.ts -t "backend/Dockerfile"`
Expected: FAIL.

- [ ] **Step 3: Write `backend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/compose.test.ts -t "backend/Dockerfile"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile tests/harness-e2e/compose.test.ts
git commit -m "feat(e2e): add backend Dockerfile for compose stack"
```

---

## Task 5: Deterministic test seed — `prisma/seed.e2e.ts`

**Files:**

- Create: `prisma/seed.e2e.ts`
- Create: `tests/harness-e2e/seed.test.ts`

> **Engineer note:** field names below (`brandId`, `status`, `url`, etc.) must match `prisma/schema.prisma` exactly. Run `cat prisma/schema.prisma` first; rename fields in `seed.e2e.ts` to match the real schema. The IDs (`e2e-user-brand`, `e2e-user-creator`, `e2e-user-admin`, `e2e-campaign-1`, `e2e-sample-1`) are the stable contract — keep those exact values.

- [ ] **Step 1: Write failing seed test**

Create `tests/harness-e2e/seed.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const TEST_DB = "postgres://e2e:e2e@localhost:54329/brand_creator_e2e";
let prisma: PrismaClient;

describe.runIf(process.env.E2E_DB === "1")("seed.e2e.ts", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
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
    const campaigns = await prisma.campaign.findMany();
    const samples = await prisma.sample.findMany();
    expect(campaigns).toHaveLength(1);
    expect(samples).toHaveLength(1);
    expect(campaigns[0].id).toBe("e2e-campaign-1");
    expect(samples[0].id).toBe("e2e-sample-1");
  });
});
```

- [ ] **Step 2: Run test (will SKIP without `E2E_DB=1`)**

Run: `npx vitest run tests/harness-e2e/seed.test.ts`
Expected: 0 tests run (skipped). Re-run after Task 8 brings stack online: `E2E_DB=1 npx vitest run tests/harness-e2e/seed.test.ts` should FAIL until Step 3 lands.

- [ ] **Step 3: Write `prisma/seed.e2e.ts`**

```ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PW = bcrypt.hashSync("e2e-password", 4);

async function main() {
  await prisma.user.upsert({
    where: { email: "brand@e2e.test" },
    update: {},
    create: {
      id: "e2e-user-brand",
      email: "brand@e2e.test",
      name: "E2E Brand",
      handle: "e2e-brand",
      role: "BRAND",
      password: PW,
      emailVerified: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { email: "creator@e2e.test" },
    update: {},
    create: {
      id: "e2e-user-creator",
      email: "creator@e2e.test",
      name: "E2E Creator",
      handle: "e2e-creator",
      role: "CREATOR",
      password: PW,
      emailVerified: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { email: "admin@e2e.test" },
    update: {},
    create: {
      id: "e2e-user-admin",
      email: "admin@e2e.test",
      name: "E2E Admin",
      handle: "e2e-admin",
      role: "STUDIO_ADMIN",
      password: PW,
      emailVerified: new Date(),
    },
  });
  await prisma.campaign.upsert({
    where: { id: "e2e-campaign-1" },
    update: {},
    create: {
      id: "e2e-campaign-1",
      brandId: "e2e-user-brand",
      name: "E2E Campaign",
      status: "ACTIVE",
    },
  });
  await prisma.sample.upsert({
    where: { id: "e2e-sample-1" },
    update: {},
    create: {
      id: "e2e-sample-1",
      creatorId: "e2e-user-creator",
      title: "E2E Sample",
      url: "https://example.test/sample.mp4",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Run test to verify it passes (after Task 8 stack is up)**

Run: `E2E_DB=1 npx vitest run tests/harness-e2e/seed.test.ts`
Expected: PASS (after stack online).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.e2e.ts tests/harness-e2e/seed.test.ts
git commit -m "feat(e2e): deterministic seed.e2e.ts with stable IDs"
```

---

## Task 6: `runId` utility

**Files:**

- Create: `scripts/e2e/lib/runId.ts`
- Create: `tests/harness-e2e/runId.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/harness-e2e/runId.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newRunId } from "../../scripts/e2e/lib/runId";

describe("newRunId", () => {
  it("returns 13-digit epoch ms string", () => {
    const id = newRunId();
    expect(id).toMatch(/^\d{13}$/);
  });

  it("returns monotonically increasing values across two calls", async () => {
    const a = newRunId();
    await new Promise((r) => setTimeout(r, 2));
    const b = newRunId();
    expect(Number(b)).toBeGreaterThan(Number(a));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/runId.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `scripts/e2e/lib/runId.ts`**

```ts
export function newRunId(): string {
  return String(Date.now());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/runId.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/e2e/lib/runId.ts tests/harness-e2e/runId.test.ts
git commit -m "feat(e2e): runId utility"
```

---

## Task 7: Health-wait helper

**Files:**

- Create: `scripts/e2e/lib/wait.ts`
- Create: `tests/harness-e2e/wait.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/harness-e2e/wait.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { waitForHttp } from "../../scripts/e2e/lib/wait";
import http from "node:http";

describe("waitForHttp", () => {
  it("resolves when endpoint returns 200", async () => {
    const srv = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as any).port;
    await waitForHttp(`http://localhost:${port}`, { timeoutMs: 2000, intervalMs: 50 });
    srv.close();
  });

  it("rejects after timeoutMs when endpoint never responds", async () => {
    await expect(
      waitForHttp("http://localhost:1", { timeoutMs: 200, intervalMs: 50 })
    ).rejects.toThrow(/timeout/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/wait.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `scripts/e2e/lib/wait.ts`**

```ts
export interface WaitOpts {
  timeoutMs: number;
  intervalMs: number;
}

export async function waitForHttp(url: string, opts: WaitOpts): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status >= 200 && res.status < 500) return;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`waitForHttp timeout after ${opts.timeoutMs}ms for ${url}: ${String(lastErr)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/wait.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/e2e/lib/wait.ts tests/harness-e2e/wait.test.ts
git commit -m "feat(e2e): waitForHttp health helper"
```

---

## Task 8: `up.ts` boot script with DATABASE_URL guardrail

**Files:**

- Create: `scripts/e2e/up.ts`
- Create: `tests/harness-e2e/up-guardrail.test.ts`

- [ ] **Step 1: Write failing guardrail test**

Create `tests/harness-e2e/up-guardrail.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertTestDatabaseUrl } from "../../scripts/e2e/up";

describe("assertTestDatabaseUrl", () => {
  it("throws on prod-looking URL", () => {
    expect(() => assertTestDatabaseUrl("postgres://prod:prod@db.prod.internal:5432/app")).toThrow(
      /refusing/i
    );
  });

  it("throws on default dev port 5432", () => {
    expect(() => assertTestDatabaseUrl("postgres://dev:dev@localhost:5432/dev")).toThrow(
      /refusing/i
    );
  });

  it("accepts test port 54329", () => {
    expect(() =>
      assertTestDatabaseUrl("postgres://e2e:e2e@localhost:54329/brand_creator_e2e")
    ).not.toThrow();
  });

  it("throws on undefined", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/up-guardrail.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `scripts/e2e/up.ts`**

```ts
#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { waitForHttp } from "./lib/wait";

const COMPOSE = "docker compose -p brand-creator-e2e -f docker/compose.e2e.yml";

export function assertTestDatabaseUrl(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL must be set");
  if (!url.includes(":54329/")) {
    throw new Error(
      `refusing to operate against non-test DATABASE_URL: ${url}. Expected port :54329`
    );
  }
}

async function main() {
  const dbUrl = "postgres://e2e:e2e@localhost:54329/brand_creator_e2e";
  process.env.DATABASE_URL = dbUrl;
  assertTestDatabaseUrl(dbUrl);

  console.log("[e2e:up] starting compose stack…");
  execSync(`${COMPOSE} up -d --wait`, { stdio: "inherit" });

  console.log("[e2e:up] waiting on http endpoints…");
  await waitForHttp("http://localhost:8001/health", { timeoutMs: 60_000, intervalMs: 1000 });
  await waitForHttp("http://localhost:12001/", { timeoutMs: 60_000, intervalMs: 1000 });

  console.log("[e2e:up] running prisma migrate deploy…");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });

  console.log("[e2e:up] seeding…");
  execSync("npx tsx prisma/seed.e2e.ts", { stdio: "inherit", env: process.env });

  console.log("[e2e:up] ready.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/up-guardrail.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Manual smoke (requires Docker)**

Run: `npx tsx scripts/e2e/up.ts`
Expected: stack boots in < 60s; final line `[e2e:up] ready.`

- [ ] **Step 6: Commit**

```bash
git add scripts/e2e/up.ts tests/harness-e2e/up-guardrail.test.ts
git commit -m "feat(e2e): up.ts boot script with DB guardrail"
```

---

## Task 9: `down.ts` teardown

**Files:**

- Create: `scripts/e2e/down.ts`

- [ ] **Step 1: Write `scripts/e2e/down.ts`**

```ts
#!/usr/bin/env tsx
import { execSync } from "node:child_process";

const COMPOSE = "docker compose -p brand-creator-e2e -f docker/compose.e2e.yml";

execSync(`${COMPOSE} down -v`, { stdio: "inherit" });
console.log("[e2e:down] removed.");
```

- [ ] **Step 2: Manual smoke**

Run: `npx tsx scripts/e2e/down.ts`
Expected: removes containers + volumes; exits 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e/down.ts
git commit -m "feat(e2e): down.ts teardown"
```

---

## Task 10: `reset-db.ts` CLI + `e2e/_helpers/resetDb.ts` fixture

**Files:**

- Create: `scripts/e2e/reset-db.ts`
- Create: `e2e/_helpers/resetDb.ts`
- Create: `tests/harness-e2e/resetDb.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/harness-e2e/resetDb.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listTruncatableTables } from "../../e2e/_helpers/resetDb";

describe("listTruncatableTables", () => {
  it("excludes _prisma_migrations", () => {
    const tables = listTruncatableTables(["_prisma_migrations", "User", "Campaign"]);
    expect(tables).toEqual(["User", "Campaign"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/resetDb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `e2e/_helpers/resetDb.ts`**

```ts
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

export function listTruncatableTables(all: string[]): string[] {
  return all.filter((t) => t !== "_prisma_migrations");
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tables = listTruncatableTables(rows.map((r) => r.tablename));
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  execSync("npx tsx prisma/seed.e2e.ts", { stdio: "inherit", env: process.env });
}
```

- [ ] **Step 4: Implement `scripts/e2e/reset-db.ts`**

```ts
#!/usr/bin/env tsx
import { PrismaClient } from "@prisma/client";
import { resetDb } from "../../e2e/_helpers/resetDb";
import { assertTestDatabaseUrl } from "./up";

async function main() {
  const url = "postgres://e2e:e2e@localhost:54329/brand_creator_e2e";
  process.env.DATABASE_URL = url;
  assertTestDatabaseUrl(url);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await resetDb(prisma);
  await prisma.$disconnect();
  console.log("[e2e:reset] done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/resetDb.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/e2e/reset-db.ts e2e/_helpers/resetDb.ts tests/harness-e2e/resetDb.test.ts
git commit -m "feat(e2e): resetDb fixture + reset-db CLI"
```

---

## Task 11: `playwright.config.ts` — E2E_AGENT branch

**Files:**

- Modify: `playwright.config.ts`

- [ ] **Step 1: Replace contents with**

```ts
import { defineConfig, devices } from "@playwright/test";

const isAgent = process.env.E2E_AGENT === "1";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  (isAgent ? "http://localhost:12001" : "http://localhost:12000");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: !isAgent,
  workers: isAgent ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: isAgent
    ? [
        ["list"],
        ["json", { outputFile: `.e2e/runs/${process.env.E2E_RUN_ID || "latest"}/report.json` }],
      ]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: isAgent ? "on" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: isAgent ? "retain-on-failure" : "off",
  },
  globalSetup: isAgent ? "./e2e/_setup/global-setup.ts" : undefined,
  globalTeardown: isAgent ? "./e2e/_setup/global-teardown.ts" : undefined,
  webServer:
    process.env.PLAYWRIGHT_BASE_URL || isAgent
      ? undefined
      : {
          command: "npm run dev",
          url: "http://localhost:12000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
  projects: isAgent
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "Mobile Safari", use: { ...devices["iPhone 13"] } },
        { name: "Pixel 5", use: { ...devices["Pixel 5"] } },
      ],
});
```

- [ ] **Step 2: Verify default mode lists tests**

Run: `npx playwright test --list`
Expected: lists existing smoke tests across 3 projects.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "feat(e2e): playwright E2E_AGENT branch"
```

---

## Task 12: Gated `/api/test/login` route

**Files:**

- Create: `src/app/api/test/login/route.ts`
- Create: `tests/harness-e2e/test-login.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/harness-e2e/test-login.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("/api/test/login gate", () => {
  it("rejects when E2E_EXPLORE !== 1", async () => {
    process.env.E2E_EXPLORE = "0";
    process.env.NODE_ENV = "development";
    const { GET } = await import("../../src/app/api/test/login/route");
    const req = new Request("http://localhost/api/test/login?role=brand");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("rejects when NODE_ENV === production even if E2E_EXPLORE=1", async () => {
    process.env.E2E_EXPLORE = "1";
    process.env.NODE_ENV = "production";
    const { GET } = await import("../../src/app/api/test/login/route");
    const req = new Request("http://localhost/api/test/login?role=brand");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns Set-Cookie when both gates pass and role is valid", async () => {
    process.env.E2E_EXPLORE = "1";
    process.env.NODE_ENV = "development";
    process.env.NEXTAUTH_SECRET = "e2e-nextauth-secret-not-prod";
    const { GET } = await import("../../src/app/api/test/login/route");
    const req = new Request("http://localhost/api/test/login?role=brand");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/next-auth\.session-token=/);
  });

  it("rejects unknown role", async () => {
    process.env.E2E_EXPLORE = "1";
    process.env.NODE_ENV = "development";
    const { GET } = await import("../../src/app/api/test/login/route");
    const req = new Request("http://localhost/api/test/login?role=hacker");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/test-login.test.ts`
Expected: FAIL — route file missing.

- [ ] **Step 3: Write `src/app/api/test/login/route.ts`**

```ts
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

const ROLE_TO_USER: Record<string, { id: string; email: string; role: string }> = {
  brand: { id: "e2e-user-brand", email: "brand@e2e.test", role: "BRAND" },
  creator: { id: "e2e-user-creator", email: "creator@e2e.test", role: "CREATOR" },
  admin: { id: "e2e-user-admin", email: "admin@e2e.test", role: "STUDIO_ADMIN" },
};

export async function GET(req: Request): Promise<Response> {
  if (process.env.E2E_EXPLORE !== "1" || process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const role = new URL(req.url).searchParams.get("role") ?? "";
  const user = ROLE_TO_USER[role];
  if (!user) {
    return NextResponse.json({ error: "unknown role" }, { status: 400 });
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "no secret" }, { status: 500 });

  const token = await encode({
    token: { sub: user.id, email: user.email, role: user.role },
    secret,
  });
  const res = NextResponse.json({ ok: true, role });
  res.headers.append(
    "set-cookie",
    `next-auth.session-token=${token}; Path=/; HttpOnly; SameSite=Lax`
  );
  return res;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/test-login.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/test/login/route.ts tests/harness-e2e/test-login.test.ts
git commit -m "feat(e2e): gated /api/test/login for explore mode"
```

---

## Task 13: Global setup — build `.e2e/auth/<role>.json`

**Files:**

- Create: `e2e/_setup/global-setup.ts`
- Create: `e2e/_setup/global-teardown.ts`

- [ ] **Step 1: Write `e2e/_setup/global-teardown.ts`**

```ts
export default async function globalTeardown(): Promise<void> {
  // No-op. Compose stack stays up across runs (idempotent).
}
```

- [ ] **Step 2: Write `e2e/_setup/global-setup.ts`**

```ts
import { chromium, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const ROLES = ["brand", "creator", "admin"] as const;

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await mkdir(".e2e/auth", { recursive: true });

  // Reset DB once at run start.
  execSync("npx tsx scripts/e2e/reset-db.ts", { stdio: "inherit", env: process.env });

  const baseURL = "http://localhost:12001";
  const browser = await chromium.launch();
  for (const role of ROLES) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    const res = await page.goto(`/api/test/login?role=${role}`);
    if (!res || res.status() !== 200) {
      throw new Error(`globalSetup login for ${role} failed: ${res?.status()}`);
    }
    await ctx.storageState({ path: path.join(".e2e/auth", `${role}.json`) });
    await ctx.close();
  }
  await browser.close();
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/_setup/global-setup.ts e2e/_setup/global-teardown.ts
git commit -m "feat(e2e): globalSetup builds storageState per role"
```

---

## Task 14: Role fixtures — `e2e/_helpers/fixtures.ts`

**Files:**

- Create: `e2e/_helpers/fixtures.ts`

- [ ] **Step 1: Write `e2e/_helpers/fixtures.ts`**

```ts
import { test as base, type Page, type Browser } from "@playwright/test";

type Roles = { asBrand: Page; asCreator: Page; asAdmin: Page };

function rolePage(role: "brand" | "creator" | "admin") {
  return async ({ browser }: { browser: Browser }, use: (p: Page) => Promise<void>) => {
    const ctx = await browser.newContext({ storageState: `.e2e/auth/${role}.json` });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  };
}

export const test = base.extend<Roles>({
  asBrand: rolePage("brand"),
  asCreator: rolePage("creator"),
  asAdmin: rolePage("admin"),
});

export { expect } from "@playwright/test";
```

- [ ] **Step 2: Commit**

```bash
git add e2e/_helpers/fixtures.ts
git commit -m "feat(e2e): role-scoped Playwright fixtures"
```

---

## Task 15: Summary builder — `lib/summary.ts`

**Files:**

- Create: `scripts/e2e/lib/summary.ts`
- Create: `tests/harness-e2e/summary.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/harness-e2e/summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSummary } from "../../scripts/e2e/lib/summary";

const passingReport = {
  stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 100 },
  suites: [
    {
      title: "e2e/foo.spec.ts",
      specs: [
        {
          title: "passes",
          tests: [{ results: [{ status: "passed", error: null, attachments: [] }] }],
        },
      ],
    },
  ],
};

const failingReport = {
  stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 0, duration: 200 },
  suites: [
    {
      title: "e2e/bar.spec.ts",
      specs: [
        {
          title: "creates campaign",
          tests: [
            {
              results: [
                {
                  status: "failed",
                  error: { message: "Timeout 5000ms waiting for selector [data-testid=submit]" },
                  attachments: [{ name: "trace", path: "/tmp/trace.zip" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("buildSummary", () => {
  it("renders ALL PASS when no failures", () => {
    const md = buildSummary(passingReport as any, "abc");
    expect(md).toMatch(/ALL PASS/);
    expect(md).toMatch(/1 passed/);
  });

  it("renders FAIL block per failing test with error and trace path", () => {
    const md = buildSummary(failingReport as any, "abc");
    expect(md).toMatch(/FAIL e2e\/bar\.spec\.ts › creates campaign/);
    expect(md).toMatch(/Timeout 5000ms/);
    expect(md).toMatch(/\/tmp\/trace\.zip/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness-e2e/summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `scripts/e2e/lib/summary.ts`**

```ts
interface PWReport {
  stats: { expected: number; unexpected: number; flaky: number; skipped: number; duration: number };
  suites: PWSuite[];
}
interface PWSuite {
  title: string;
  specs: PWSpec[];
  suites?: PWSuite[];
}
interface PWSpec {
  title: string;
  tests: { results: PWResult[] }[];
}
interface PWResult {
  status: string;
  error?: { message?: string } | null;
  attachments?: { name: string; path?: string }[];
}

function* walk(suites: PWSuite[]): Generator<{ file: string; spec: PWSpec }> {
  for (const s of suites) {
    for (const spec of s.specs) yield { file: s.title, spec };
    if (s.suites) yield* walk(s.suites);
  }
}

export function buildSummary(report: PWReport, runId: string): string {
  const { expected, unexpected, flaky, skipped } = report.stats;
  const header =
    unexpected === 0
      ? `# E2E run ${runId} — ALL PASS\n\n${expected} passed, ${flaky} flaky, ${skipped} skipped\n`
      : `# E2E run ${runId} — ${unexpected} FAILED\n\n${expected} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped\n`;

  const blocks: string[] = [];
  for (const { file, spec } of walk(report.suites)) {
    const last = spec.tests[0]?.results.at(-1);
    if (!last || last.status === "passed") continue;
    const trace = last.attachments?.find((a) => a.name === "trace")?.path ?? "(no trace)";
    blocks.push(
      [
        `## FAIL ${file} › ${spec.title}`,
        `  status: ${last.status}`,
        `  error:  ${last.error?.message ?? "(no error message)"}`,
        `  trace:  ${trace}`,
        "",
      ].join("\n")
    );
  }
  return header + (blocks.length ? "\n" + blocks.join("\n") : "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness-e2e/summary.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/e2e/lib/summary.ts tests/harness-e2e/summary.test.ts
git commit -m "feat(e2e): summary.md builder from Playwright JSON report"
```

---

## Task 16: `agent.ts` wrapper

**Files:**

- Create: `scripts/e2e/agent.ts`

- [ ] **Step 1: Write `scripts/e2e/agent.ts`**

```ts
#!/usr/bin/env tsx
import { execSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  unlinkSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { newRunId } from "./lib/runId";
import { buildSummary } from "./lib/summary";

function rotateRuns(rootDir: string, keep = 10): void {
  if (!existsSync(rootDir)) return;
  const dirs = readdirSync(rootDir)
    .filter((n) => /^\d{13}$/.test(n))
    .map((n) => ({ n, t: statSync(path.join(rootDir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const d of dirs.slice(keep))
    rmSync(path.join(rootDir, d.n), { recursive: true, force: true });
}

async function main() {
  const runId = newRunId();
  const runDir = path.join(".e2e/runs", runId);
  mkdirSync(runDir, { recursive: true });

  execSync("npx tsx scripts/e2e/up.ts", { stdio: "inherit" });

  const args = process.argv.slice(2);
  const env = { ...process.env, E2E_AGENT: "1", E2E_RUN_ID: runId, E2E_EXPLORE: "1" };
  const result = spawnSync("npx", ["playwright", "test", ...args], { stdio: "inherit", env });

  const reportPath = path.join(runDir, "report.json");
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const md = buildSummary(report, runId);
    writeFileSync(path.join(runDir, "summary.md"), md);
  } else {
    writeFileSync(path.join(runDir, "summary.md"), `# E2E run ${runId} — NO REPORT\n`);
  }

  const latest = path.join(".e2e/runs", "latest");
  if (existsSync(latest)) unlinkSync(latest);
  symlinkSync(runId, latest, "dir");

  rotateRuns(".e2e/runs", 10);

  console.log(`[e2e:agent] runId=${runId} summary=.e2e/runs/latest/summary.md`);
  process.exit(result.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/e2e/agent.ts
git commit -m "feat(e2e): agent.ts TDD wrapper with summary.md output"
```

---

## Task 17: npm scripts wiring + end-to-end smoke

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add scripts under `"scripts"` (preserve existing entries)**

```json
"e2e:up":      "tsx scripts/e2e/up.ts",
"e2e:down":    "tsx scripts/e2e/down.ts",
"e2e:reset":   "tsx scripts/e2e/reset-db.ts",
"e2e:agent":   "tsx scripts/e2e/agent.ts",
"e2e:explore": "tsx scripts/e2e/explore.ts",
"e2e:debug":   "tsx scripts/e2e/debug.ts",
"e2e:ci":      "E2E_AGENT=1 playwright test"
```

- [ ] **Step 2: End-to-end smoke against existing smoke spec**

Run: `npm run e2e:up && npm run e2e:agent -- e2e/smoke/auth.spec.ts`
Expected:

- Stack boots in < 60s.
- `.e2e/auth/{brand,creator,admin}.json` created.
- `.e2e/runs/latest/summary.md` exists and starts with `# E2E run`.

- [ ] **Step 3: Verify cookie reuse on second run**

Run: `npm run e2e:agent -- e2e/smoke/auth.spec.ts`
Expected: same outcome, no stale-cookie failures.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(e2e): wire e2e:* npm scripts"
```

---

## Task 18: `explore.ts`

**Files:**

- Create: `scripts/e2e/explore.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write `scripts/e2e/explore.ts`**

```ts
#!/usr/bin/env tsx
import { execSync } from "node:child_process";

process.env.E2E_EXPLORE = "1";
execSync("npx tsx scripts/e2e/up.ts", { stdio: "inherit", env: process.env });
console.log(`
[e2e:explore] stack ready.
  web:      http://localhost:12001
  api:      http://localhost:8001
  pg:       postgres://e2e:e2e@localhost:54329/brand_creator_e2e
  test login (gated by E2E_EXPLORE=1):
    GET http://localhost:12001/api/test/login?role=brand
    GET http://localhost:12001/api/test/login?role=creator
    GET http://localhost:12001/api/test/login?role=admin

Connect MCP Playwright to http://localhost:12001 and walk flows.
Save discovered flows to e2e/<surface>/<feat>.draft.ts (gitignored).
Tear down: npm run e2e:down
`);
```

- [ ] **Step 2: Append to `.gitignore`**

```
e2e/**/*.draft.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e/explore.ts .gitignore
git commit -m "feat(e2e): explore.ts MCP boot"
```

---

## Task 19: `debug.ts` + `probes.ts`

**Files:**

- Create: `scripts/e2e/debug.ts`
- Create: `e2e/_helpers/probes.ts`

- [ ] **Step 1: Write `e2e/_helpers/probes.ts`**

```ts
type Probe = () => Promise<{ name: string; ok: boolean; detail?: string }>;
const REGISTRY = new Map<string, Probe[]>();

export function registerProbe(specFile: string, probe: Probe): void {
  const list = REGISTRY.get(specFile) ?? [];
  list.push(probe);
  REGISTRY.set(specFile, list);
}

export function getProbes(specFile: string): Probe[] {
  return REGISTRY.get(specFile) ?? [];
}
```

- [ ] **Step 2: Write `scripts/e2e/debug.ts`**

```ts
#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const runId = process.argv[2];
if (!runId) {
  console.error("usage: npm run e2e:debug -- <runId>");
  process.exit(2);
}
const runDir = path.join(".e2e/runs", runId);
if (!existsSync(runDir)) {
  console.error(`no such run: ${runDir}`);
  process.exit(2);
}

const summary = path.join(runDir, "summary.md");
if (existsSync(summary)) {
  console.log("=== summary ===");
  console.log(readFileSync(summary, "utf8"));
}

console.log("\n=== api logs (last 50) ===");
try {
  console.log(
    execSync("docker compose -p brand-creator-e2e -f docker/compose.e2e.yml logs --tail=50 api", {
      encoding: "utf8",
    })
  );
} catch (e) {
  console.error("(failed to fetch api logs)", e);
}

console.log("\n=== web logs (last 50) ===");
try {
  console.log(
    execSync("docker compose -p brand-creator-e2e -f docker/compose.e2e.yml logs --tail=50 web", {
      encoding: "utf8",
    })
  );
} catch (e) {
  console.error("(failed to fetch web logs)", e);
}
```

- [ ] **Step 3: Manual smoke**

Run: `npm run e2e:debug -- $(readlink .e2e/runs/latest)`
Expected: prints summary + last 50 lines of api & web logs.

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e/debug.ts e2e/_helpers/probes.ts
git commit -m "feat(e2e): debug.ts + probe registry"
```

---

## Task 20: Representative feature TDD test — campaign create

**Files:**

- Create: `e2e/brand/campaign-create.spec.ts`

> **Engineer note:** this test validates the harness end-to-end as a TDD example. If the campaign creation flow doesn't yet exist in the brand portal, the test starts red and the engineer either updates selectors to match an existing flow, or implements the missing UI as a follow-up sub-task. Either way, the harness behavior (red → readable summary → green) is verified.

- [ ] **Step 1: Write spec**

```ts
import { test, expect } from "../_helpers/fixtures";

test.describe("brand / campaign create", () => {
  test("creates a campaign and lands on its detail page", async ({ asBrand }) => {
    await asBrand.goto("/brand/campaigns/new");
    await asBrand.getByLabel("Name").fill("Test Campaign 1");
    await asBrand.getByRole("button", { name: /create campaign/i }).click();
    await expect(asBrand.getByRole("heading", { name: "Test Campaign 1" })).toBeVisible();
    await expect(asBrand).toHaveURL(/\/brand\/campaigns\/[a-z0-9-]+$/i);
  });
});
```

- [ ] **Step 2: Run via agent**

Run: `npm run e2e:agent -- --grep "creates a campaign"`
Expected (red on first run): FAIL with selector or routing error in `.e2e/runs/latest/summary.md`. Iterate per agent loop until green.

- [ ] **Step 3: Commit**

```bash
git add e2e/brand/campaign-create.spec.ts
git commit -m "test(e2e): campaign create spec (TDD seed)"
```

---

## Task 21: CI workflow

**Files:**

- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: e2e

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:up
      - run: npm run e2e:ci -- e2e/smoke
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-runs
          path: .e2e/runs/latest
      - if: always()
        run: npm run e2e:down
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci(e2e): smoke workflow on PR"
```

---

## Task 22: Operator docs

**Files:**

- Create: `docs/e2e.md`
- Modify: `docs/harness.md` (add link near top "Source of truth" line)

- [ ] **Step 1: Write `docs/e2e.md`**

```markdown
# E2E Harness — Operator Guide

**Source of truth:** [`docs/superpowers/specs/2026-05-07-agentic-e2e-harness-design.md`](superpowers/specs/2026-05-07-agentic-e2e-harness-design.md)

## Quick reference

| Command                        | What it does                                                        |
| ------------------------------ | ------------------------------------------------------------------- |
| `npm run e2e:up`               | Boots compose stack, runs migrate + seed. Idempotent.               |
| `npm run e2e:down`             | Stops + removes containers and volumes.                             |
| `npm run e2e:reset`            | Truncates DB and re-seeds.                                          |
| `npm run e2e:agent`            | Runs Playwright in agent mode; emits `.e2e/runs/latest/summary.md`. |
| `npm run e2e:explore`          | Boots stack only; prints MCP connect info.                          |
| `npm run e2e:debug -- <runId>` | Prints summary + last 50 lines of api/web logs.                     |
| `npm run e2e`                  | Legacy fast path: dev `webServer`, no compose. Smoke only.          |

## Agent TDD loop

1. Read feature spec under `docs/superpowers/specs/`.
2. Write failing test at `e2e/<surface>/<feat>.spec.ts` using `import { test, expect } from "../_helpers/fixtures"` and the `asBrand|asCreator|asAdmin` fixture.
3. Run `npm run e2e:agent -- --grep "<test title>"`.
4. Read `.e2e/runs/latest/summary.md`.
5. Edit `src/` or `backend/app/` until green.
6. Commit test + impl.

## DB state

`prisma/seed.e2e.ts` defines deterministic users with stable IDs:

| Email              | ID                 | Role         |
| ------------------ | ------------------ | ------------ |
| `brand@e2e.test`   | `e2e-user-brand`   | BRAND        |
| `creator@e2e.test` | `e2e-user-creator` | CREATOR      |
| `admin@e2e.test`   | `e2e-user-admin`   | STUDIO_ADMIN |

Plus 1 campaign (`e2e-campaign-1`) and 1 sample (`e2e-sample-1`).

`globalSetup` truncates + reseeds at the start of every agent run.

## Auth

`.e2e/auth/<role>.json` holds a Playwright `storageState` per role, built fresh per run via the gated `/api/test/login?role=<role>` shortcut. Gate: `E2E_EXPLORE=1` AND `NODE_ENV !== 'production'`. Never present in prod.

## Files & dirs

- `.e2e/auth/` — gitignored storageState
- `.e2e/runs/<runId>/` — gitignored: `report.json`, `summary.md`, `trace-*.zip`, `console.log`
- `.e2e/runs/latest` — symlink to most recent run

`agent.ts` keeps the last 10 runs and prunes older.
```

- [ ] **Step 2: Add link to `docs/harness.md`**

After existing "Source of truth" line near top, append:

```
**E2E:** [docs/e2e.md](e2e.md) — agentic E2E harness operator guide.
```

- [ ] **Step 3: Commit**

```bash
git add docs/e2e.md docs/harness.md
git commit -m "docs(e2e): operator guide + harness link"
```

---

## Task 23: Acceptance verification

- [ ] **Step 1: Cold boot timing**

Run: `npm run e2e:down && time npm run e2e:up`
Expected: completes in < 60s on a dev laptop.

- [ ] **Step 2: Inner loop timing**

Run: `npm run e2e:up && time npm run e2e:agent -- e2e/smoke/auth.spec.ts`
Expected: completes in < 15s after stack ready. `.e2e/runs/latest/summary.md` contains `ALL PASS` or actionable failure block.

- [ ] **Step 3: Two sequential agent runs — no stale cookies**

Run: `npm run e2e:agent -- e2e/smoke/auth.spec.ts && npm run e2e:agent -- e2e/smoke/auth.spec.ts`
Expected: both produce `ALL PASS`. `.e2e/auth/*.json` regenerated each run.

- [ ] **Step 4: CI smoke on clean checkout**

Open PR. Verify `e2e / smoke` job passes.

- [ ] **Step 5: Final commit (if acceptance fixes needed)**

```bash
git add -A
git commit -m "chore(e2e): acceptance fixes" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** §2–§13 of the spec map to Tasks 2–22. Acceptance criteria (§15) covered by Task 23. Out-of-scope items (§16) intentionally absent.
- **Placeholders:** none. Every code step contains the file's content. The `prisma/schema.prisma` field-name caveat in Task 5 is explicit and actionable, not a placeholder.
- **Type consistency:** `assertTestDatabaseUrl` defined in Task 8, reused in Task 10. `buildSummary(report, runId)` signature consistent between Task 15 implementation and Task 16 caller. Role names `brand|creator|admin` consistent across seed (Task 5), test-login route (Task 12), globalSetup (Task 13), fixtures (Task 14). `newRunId()` defined in Task 6, called in Task 16.
- **Known fragilities flagged in plan:** Task 5 schema field names need verification against `prisma/schema.prisma`; Task 4 may be a no-op if `backend/Dockerfile` exists; Task 20 assumes a `/brand/campaigns/new` route — engineer may need to update selectors or add the missing UI flow.
