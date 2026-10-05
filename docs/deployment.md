# Deployment

The app deploys to Netlify. Build command: `npx prisma generate && next build`.

See [architecture.md](architecture.md) for the system overview and [harness.md](harness.md) for the quality gates that run before and after each deploy.

---

## `netlify.toml` Walkthrough

Current `netlify.toml` (repo root):

```toml
[build]
  command = "npx prisma generate && next build"
  publish = ".next"

[functions]
  external_node_modules = ["@prisma/client", "axios"]
  included_files = ["prisma/**", "node_modules/.prisma/client/**"]

[[plugins]]
  package = "@netlify/plugin-nextjs"

[[plugins]]
  package = "/plugins/smoke-e2e"
```

| Key                               | Value                                         | Purpose                                                                                                      |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `build.command`                   | `npx prisma generate && next build`           | Generates the Prisma client before building Next.js                                                          |
| `build.publish`                   | `.next`                                       | Netlify serves from the Next.js build output                                                                 |
| `functions.external_node_modules` | `@prisma/client`, `axios`                     | Bundled outside the function zip (large native binaries)                                                     |
| `functions.included_files`        | `prisma/**`, `node_modules/.prisma/client/**` | Prisma schema/migrations, and the generated client + query engine the `ai-video-*` functions load at runtime |
| `@netlify/plugin-nextjs`          | official plugin                               | Adapts Next.js App Router for Netlify's edge/functions runtime                                               |
| `/plugins/smoke-e2e`              | local build plugin                            | Runs Playwright smoke tests via `onSuccess` on every preview deploy                                          |

---

## Required Environment Variables

Set these in the Netlify site dashboard under **Site configuration → Environment variables**:

| Variable          | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `DATABASE_URL`    | Pooled PostgreSQL connection string                        |
| `DIRECT_URL`      | Direct PostgreSQL connection (for migrations)              |
| `NEXTAUTH_SECRET` | NextAuth.js secret for session signing                     |
| `NEXTAUTH_URL`    | Canonical site URL (e.g., `https://your-site.netlify.app`) |

Additional secrets (Supabase, TikTok, email) mirror what you have in `.env.local`. See `AGENTS.md` for the full list of env categories.

### AI video generation

| Variable               | Purpose                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `SEEDANCE_LIVE`        | `1` enables real, billable generation. Leave unset (mock) until launch is approved. |
| `VIDEO_API_BASE_URL`   | Base URL from the AI Open Platform console. No default in code.                     |
| `VIDEO_API_KEY`        | Provider `ApiKey`. Never logged.                                                    |
| `SEEDANCE_MODE`        | `fast` / `pro` / `mini` / `seedance2.5` (default `seedance2.5`).                    |
| `AI_VIDEO_DAILY_LIMIT` | Generations per creator per UTC day (default 5).                                    |

Live calls need all three of `SEEDANCE_LIVE`, `VIDEO_API_BASE_URL` and `VIDEO_API_KEY`; otherwise the app uses the mock provider.

Before enabling live generation in production:

- **No IP allowlist on the key.** Netlify functions have no fixed egress IP. If the provider key has a source-IP allowlist, every live call from Netlify is rejected.
- **Apply the migration.** `20261005221656_ai_video_task_generation` must be applied to the production database; the build does not run migrations (see [database.md](database.md)).
- **Scheduled sweep.** `netlify/functions/ai-video-sync-scheduled.ts` runs every 10 minutes, but only on published production deploys. On previews, invoke it by hand to test it.
- **Verify on a preview.** Check that `ai-video-finalize-background` and `ai-video-sync-scheduled` load and reach Postgres, i.e. that the Prisma engine is bundled. This can't be tested locally.

---

## Build Command

```
npx prisma generate && next build
```

`prisma generate` must run before `next build` so the Prisma client is present when Next.js compiles server components. If you add a new Prisma client dependency, ensure this ordering is preserved.

---

## Preview Gates

The smoke E2E Netlify Build Plugin (`/plugins/smoke-e2e`, registered in PR 8) runs Playwright smoke tests against `$DEPLOY_PRIME_URL` via its `onSuccess` hook after each preview build. Smoke failures fail the deploy. Smoke artifacts (screenshots, traces) are visible in the Netlify deploy log.

The plugin runs only when `DEPLOY_PRIME_URL` is set. Production deploys do not set this variable, so smoke tests are a preview-only gate by design.

Hook error output will reference this anchor:

```
[netlify smoke] /login failed render assertion.
  See: docs/deployment.md#preview-gates
```

---

## Rollback

To revert a broken production deploy:

1. Open the Netlify dashboard for this site.
2. Navigate to **Deploys**.
3. Find the last known-good deploy in the list.
4. Click **Publish deploy** on that entry.

Netlify makes the selected deploy live immediately. No git revert required (though you should also revert the code if the deploy caused a regression).

---

## When to Update

Update this file when:

- `netlify.toml` is modified (new plugins, changed build command, new redirect rules).
- Required environment variables change.
- The rollback procedure changes.
- Preview gate behavior changes (e.g., smoke suite scope expands).
