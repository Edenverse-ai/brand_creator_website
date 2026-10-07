# Database

Prisma ORM connected to a hosted PostgreSQL database.

See [architecture.md](architecture.md) for the broader system context.

---

## Schema

Schema lives at `prisma/schema.prisma`. This file is the single source of truth for all database models. The datasource block uses two connection strings:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- `DATABASE_URL` — pooled connection (used by Prisma at runtime via a connection pooler such as Supabase's PgBouncer).
- `DIRECT_URL` — direct connection (used by Prisma Migrate, which requires a non-pooled connection to run DDL).

Set both in `.env.local`. Copy `.env.example` if present.

> **Legacy note:** `AGENTS.md` mentions `prisma/dev.db` (SQLite). That file is no longer used; the project targets PostgreSQL exclusively.

---

## Seeding

Populate the local database with seed data:

```bash
npm run prisma:seed
# or equivalently
npm run db:seed
```

Both commands run `node prisma/seed.js`.

---

## Migrations

Migration snapshots live in `prisma/migrations/`. Each migration is a timestamped folder containing a `migration.sql` file. Commit migration files alongside schema changes.

```bash
# After editing prisma/schema.prisma:
npm run prisma:migrate    # creates and applies a new migration (prisma migrate dev)
npm run prisma:generate   # regenerates the Prisma client (run after migrate or when switching branches)
```

---

## Migration Workflow

1. Edit `prisma/schema.prisma` to add or change models.
2. Run `npm run prisma:migrate` — this creates a new migration file in `prisma/migrations/` and applies it to your local database.
3. Commit both `prisma/schema.prisma` and the new `prisma/migrations/<timestamp>_<name>/` folder in the same commit as the code that depends on the schema change.

**Shadow database:** `prisma migrate dev` uses a shadow database to verify migrations are consistent. Ensure your database user has permission to create and drop databases, or configure `shadowDatabaseUrl` in `schema.prisma` if your provider restricts this (common with Supabase).

**Production is not migrated by the build.** The Netlify build runs only `prisma generate && next build`, so a new migration must be applied to the production database separately before the code that needs it goes live.

### Known drift (as of 2026-10-05)

The migration history and `schema.prisma` already disagree, independent of any new change:

- The `Campaign` table exists in migrations but was removed from the schema.
- Several models were added to the schema without migrations, including `AiVideo`, `AiVideoRequest`, `Contact`, `FindCreator`, `avocadata` and `influencer_verifications`.

Consequences:

- `prisma migrate dev` puts all of that drift into whatever new migration you generate, including a `DROP TABLE "Campaign"`. **Always review the generated SQL and trim it to your change.** A diff between two schema versions gives the exact delta: `npx prisma migrate diff --from-schema-datamodel <old schema> --to-schema-datamodel prisma/schema.prisma --script`.
- With `SHADOW_DATABASE_URL` set, the drift hook reports this pre-existing drift too. Resolving it (a baseline migration matched against production) is separate work.

---

## AI video tasks

`AiVideoTask` backs both the manual Storyclaw workflow and automated Seedance generation (migration `20261005221656_ai_video_task_generation`):

| Field                                  | Purpose                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `status`                               | `QUEUED → GENERATING → DELIVERED`, or `FAILED` (new). `IN_REVIEW` is used by the manual flow.                                       |
| `portraitPath`                         | Optional reference image (now nullable; text-to-video has none).                                                                    |
| `provider`, `providerTaskId`, `params` | Which provider (`ai-open-platform` or `mock`), its task id, and the generation settings.                                            |
| `errorMessage`, `failureCode`          | Creator-facing reason; `submit_rejected`, `unknown_outcome`, `provider_failed` or `timeout`. Drives the daily-cap rule.             |
| `traceId`, `completionTokens`          | Provider trace id and token usage, for support and billing reconciliation.                                                          |
| `submitStartedAt`, `finalizeStartedAt` | Atomic claims: at most one billable create call, and one copy into the library, per task.                                           |
| `lastCheckedAt`                        | Last provider status check; orders the scheduled sweep.                                                                             |
| `aiVideoId`                            | The `AiVideo` (My Videos) row created on delivery. The migration also creates `AiVideo` if missing (`IF NOT EXISTS`) for local/E2E. |

See [the design spec](superpowers/specs/2026-10-05-seedance-video-generation-design.md) §6.

---

## Drift Detection

Schema drift occurs when `prisma/schema.prisma` has been edited but no corresponding migration file was created — the schema and the migration history are out of sync.

A pre-commit hook (added in a later harness PR) runs `prisma migrate diff` to detect schema-vs-migrations drift. If drift is detected, run `npm run prisma:migrate` to create a migration that captures the change, then commit the new migration files.

**Shadow database setup.** The drift hook requires `SHADOW_DATABASE_URL` set to a non-production Postgres instance (local Postgres, Supabase branch, or any throwaway DB). Without it, the hook skips with an advisory message — drift is NOT enforced. Never point `SHADOW_DATABASE_URL` at production: Prisma performs schema create/apply/drop operations on the shadow DB during `migrate diff`. For local development, the simplest setup is `postgresql://localhost:5432/_shadow` against a local Postgres instance. The hook also requires Node ≥20.12 for `.env` autoloading.

Hook error output will reference this anchor:

```
[pre-commit] Prisma schema drift detected.
  Fix: npm run prisma:migrate
  See: docs/database.md#migration-workflow
```

---

## When to Update

Update this file when:

- A new Prisma model is added or an existing one is significantly changed.
- The migration workflow changes (e.g., shadow database configuration).
- Connection environment variable names change.
