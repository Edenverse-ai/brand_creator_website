/**
 * Guards every script in scripts/e2e/ that runs a DB-mutating operation
 * (migrate, grant, seed, reset) against ever touching a non-local database.
 * Every entry point that can reach Postgres — including new ones — must call
 * this before doing anything else.
 */
export function assertTestDatabaseUrl(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL must be set");
  if (!url.includes(":54329/")) {
    throw new Error(
      `refusing to operate against non-test DATABASE_URL: ${url}. Expected port :54329`
    );
  }
}
