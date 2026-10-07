import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl } from "../../scripts/e2e/lib/assertTestDatabaseUrl";

/**
 * Direct DB access for specs that need state the UI can't create cheaply
 * (e.g. a creator already at the daily generation cap). Local test DB only.
 */
const LOCAL_TEST_DB = "postgres://postgres:postgres@localhost:54329/postgres";

export const E2E_CREATOR_ID = "e2e-user-creator";

export function testDb(): PrismaClient {
  assertTestDatabaseUrl(LOCAL_TEST_DB);
  return new PrismaClient({ datasources: { db: { url: LOCAL_TEST_DB } } });
}
