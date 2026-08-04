#!/usr/bin/env tsx
import { PrismaClient } from "@prisma/client";
import { resetDb } from "../../e2e/_helpers/resetDb";
import { assertTestDatabaseUrl } from "./up";

async function main() {
  const url = "postgres://postgres:postgres@localhost:54329/postgres";
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
