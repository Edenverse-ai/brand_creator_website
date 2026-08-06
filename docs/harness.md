# Dev Pipeline Harness

Six-layer quality harness: fast edit-time feedback → pre-commit gates → pre-push full checks → on-demand scripts → Netlify preview smoke.

**Source of truth:** [`docs/superpowers/specs/2026-05-03-dev-pipeline-harness-design.md`](superpowers/specs/2026-05-03-dev-pipeline-harness-design.md) — read that file for the full design rationale and decisions.

**E2E:** [docs/e2e.md](e2e.md) — agentic E2E harness operator guide.

> All harness layers (0–5) are live as of this PR. Layer-specific PR references are noted under each layer's `**Status:**` line.

Every hook failure prints:

1. What failed.
2. The concrete fix command.
3. A `docs/<file>.md#<anchor>` reference.

---

## Layer 0 Knowledge

`/docs/` at repo root. This directory. Read on first contact; linked from every hook failure message.

Reading order: [docs/README.md](README.md).

**Status:** Live (this PR).

---

## Layer 1 Edit-Time

IDE and Claude Code feedback — sub-second.

- **Prettier on save** via VSCode `editor.formatOnSave` (`.vscode/settings.json` committed in a later harness PR).
- **ESLint LSP** shows violations live in the editor.
- **`tsc` language service** via `@typescript/language-service`.
- **Claude Code PostToolUse hooks** (Write|Edit) run Prettier + ESLint `--fix` on the edited file, configured in `.claude/settings.json` (added in PR 9).

**Status:** Partially live. Claude Code hooks live (PR 9). VSCode `editor.formatOnSave` not yet wired.

### Claude Code PostToolUse Hooks (PR 9)

One hook script fires automatically after every `Write` or `Edit` tool call Claude Code makes:

| Script                             | Trigger                                                        | Actions                                                                               |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `scripts/harness/claude-format.js` | Any file matching `*.{ts,tsx,js,jsx,mjs,json,md,yml,yaml,css}` | `prettier --write <file>`; then `eslint --fix --max-warnings=0 <file>` for TS/JS only |

The hook is registered in `.claude/settings.json` under `hooks.PostToolUse` with matcher `Write|Edit`. Hook failures print to stderr but do **not** block tool execution — they are best-effort post-edit hygiene, not gates.

The companion `claude-ruff.js` hook (Python, `backend/**/*.py`) was retired with the FastAPI backend in the Phase 5 decommission — see [legacy/ARCHIVE.md](../legacy/ARCHIVE.md).

**Performance note:** Each TS/JS edit adds ~1–3 s for Prettier + ESLint. This is acceptable for the quality guarantee it provides.

**To disable the hook for a session:** run `/hooks` in Claude Code to open the hooks manager and toggle off the `Write|Edit` entry. Re-enable by toggling it back on. Alternatively, remove or rename `.claude/settings.json` temporarily.

---

## Layer 2 Pre-Commit

Husky + lint-staged. Single `pre-commit` hook dispatches by file glob.

| Glob                       | Actions                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `*.{ts,tsx,js,jsx,mjs}`    | `prettier --write` → `eslint --fix --max-warnings=0`              |
| `*.{ts,tsx}`               | `tsc --noEmit` scoped to changed files via `tsc-files`            |
| `prisma/schema.prisma`     | `prisma format` → drift check (`prisma migrate diff --exit-code`) |
| `*.{json,md,yml,yaml,css}` | `prettier --write`                                                |

**Friction note.** The per-file `eslint --fix --max-warnings=0` step blocks a commit when the staged file already carries a warning, even if your change is unrelated to the warning. The 35 warnings tracked at branch creation (`@next/next/no-img-element`, `react-hooks/exhaustive-deps`) live in roughly 20 files. If your commit touches one of these, fix the warning in-place or add a `// eslint-disable-next-line <rule> -- TODO(harness): <issue>` comment with a tracking issue. To preview the warning list, run `npm run lint`. To run the strictest gate manually, `npm run lint:strict`.

Target: < 10 s on a typical staged set (touches only staged files).

Hook error format:

```
[pre-commit] ESLint: 3 errors in src/app/login/page.tsx
  Fix: npm run lint -- --fix
  See: docs/harness.md#layer-2-pre-commit
```

**Status:** Live (PR 3 + PR 6).

---

## Layer 3 Pre-Push

Full-repo checks. Single `pre-push` hook runs `npm run harness:prepush`:

1. `tsc --noEmit` (full project)
2. `npm run lint  # eslint . — warns allowed per plan §1.3`
3. `prisma migrate diff --exit-code` (full drift check)
4. `vitest run` (unit suite)

Use `npm run lint:strict` as an opt-in zero-tolerance variant (zero warnings allowed).

Target: < 60 s.

Hook error format:

```
[pre-push] TypeScript errors found.
  Fix: npm run typecheck
  See: docs/harness.md#layer-3-pre-push
```

**Status:** Live (PR 4 + PR 5 + PR 6).

> **Platform note:** the `harness:prepush` script uses POSIX shell syntax. Windows contributors should run it via Git Bash or WSL. Native cmd.exe / PowerShell is not supported by the harness in its current form.

---

## Layer 4 Local On-Demand

Manual scripts available via `package.json` (added in later harness PRs):

| Script                    | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `npm run e2e`             | Playwright smoke tests vs local dev server           |
| `npm run e2e:preview`     | Playwright smoke tests vs `$DEPLOY_PRIME_URL`        |
| `npm run harness:full`    | Layer 3 checks + E2E                                 |
| `npm run harness:install` | Bootstrap: install Husky, scaffold env, print banner |

**Status:** Live (PRs 3, 7, 8).

---

## Layer 5 Netlify Preview

Netlify Build Plugin colocated at `plugins/smoke-e2e/` (added in PR 8).

Build sequence on each preview deploy:

1. `npx prisma generate`
2. `next build`
3. Plugin `onSuccess` hook:
   - Installs Playwright browsers (cached by Netlify).
   - Runs smoke suite against `$DEPLOY_PRIME_URL`.
   - Fails the deploy on smoke failure.

Smoke suite covers: `/login`, `/brandportal` landing, `/creatorportal` landing, `/find-creators`. Each spec checks: page renders, no `console.error`, primary CTA visible.

The plugin only runs when `DEPLOY_PRIME_URL` is set — production deploys skip smoke by design.

See [deployment.md#preview-gates](deployment.md#preview-gates) for deploy-level detail.

**Status:** Live (PR 8).

---

## Bypass Rules

The `--no-verify` flag to `git commit` skips the pre-commit hook. Use it only when:

- You have a documented justification in the commit body (e.g., `bypass: pre-commit — WIP stash, not for merge`).
- You accept that Layer 5 (Netlify preview smoke) will catch what local skipped.

Habitual use of `--no-verify` defeats the harness. If the hook is too slow or incorrectly blocking, fix the hook rather than bypassing it. See the [spec](superpowers/specs/2026-05-03-dev-pipeline-harness-design.md) §8 for risk mitigations.

---

## Troubleshooting

This section will be expanded as each harness PR lands with per-failure-type entries. Stub entries below.

| Symptom                                  | Likely cause                      | Fix                                                                                             |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Pre-commit blocks on ESLint errors       | Rule violation in staged file     | `npm run lint -- --fix`, review remaining errors                                                |
| Pre-commit blocks on Prisma drift        | Schema edited without migration   | `npm run prisma:migrate` — see [database.md#migration-workflow](database.md#migration-workflow) |
| Pre-push TypeScript errors               | Type error in full project        | `npm run typecheck`, fix errors, re-push                                                        |
| Netlify preview smoke fails              | Page render broken on preview URL | Check deploy log screenshots; fix the route; re-deploy                                          |
| `--no-verify` was used and preview fails | Local gates skipped               | Fix the underlying issue; do not use `--no-verify` again                                        |

---

## When to Update

Update this file when:

- A layer's hooks, commands, or file globs change.
- A new layer is added.
- Bypass policy changes.
- A concrete troubleshooting entry is ready to replace a stub.
