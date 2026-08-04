#!/usr/bin/env tsx
import { execSync } from "node:child_process";

process.env.E2E_EXPLORE = "1";
execSync("npx tsx scripts/e2e/up.ts", { stdio: "inherit", env: process.env });
console.log(`
[e2e:explore] stack ready.
  web:      http://localhost:12001
  api:      http://localhost:8001
  pg:       postgres://postgres:postgres@localhost:54329/postgres
  studio:   http://localhost:54323
  test login (gated by E2E_EXPLORE=1):
    GET http://localhost:12001/api/test/login?role=brand
    GET http://localhost:12001/api/test/login?role=creator
    GET http://localhost:12001/api/test/login?role=admin

Connect MCP Playwright to http://localhost:12001 and walk flows.
Save discovered flows to e2e/<surface>/<feat>.draft.ts (gitignored).
Tear down: npm run e2e:down
`);
