# Contributing

One-page lifecycle reference. For full repo conventions see [`AGENTS.md`](../AGENTS.md). For hook expectations see [`docs/harness.md`](harness.md).

---

## Lifecycle: edit → commit → push → preview → merge

### 1. Edit

- Follow naming conventions in [`AGENTS.md`](../AGENTS.md): PascalCase components, camelCase helpers, kebab-case routes, `@/` alias for `src/` imports.
- Run `npm run dev` to verify changes locally.
- If you edited `prisma/schema.prisma`, run `npm run prisma:migrate` before staging. See [database.md#migration-workflow](database.md#migration-workflow).

### 2. Commit

- Stage your changes with `git add`.
- The pre-commit hook ([harness Layer 2](harness.md#layer-2-pre-commit)) runs automatically: Prettier, ESLint, TypeScript, and Prisma drift check on staged files.
- If the hook blocks, read the error output — it includes a fix command and a `docs/` anchor.
- Write commit messages in Conventional Commit style: `feat:`, `fix:`, `chore:`, `docs:`, etc. Subject line ≤ 72 characters.
- Only use `--no-verify` with a justification in the commit body. See [harness.md#bypass-rules](harness.md#bypass-rules).

### 3. Push

- The pre-push hook ([harness Layer 3](harness.md#layer-3-pre-push)) runs full-repo TypeScript, ESLint, Prisma drift, and Vitest checks.
- Fix any failures before the push completes. The hook error output includes the fix command.

### 4. Preview

- Each pushed branch triggers a Netlify preview deploy.
- Once the Netlify smoke plugin lands (PR 8), a Playwright smoke suite will run against the preview URL. A failing smoke test fails the deploy.
- Check the Netlify deploy log for smoke artifacts (screenshots, traces) if the preview fails. See [deployment.md#preview-gates](deployment.md#preview-gates).

### 5. Merge

- Resolve any review comments.
- Confirm the preview deploy is green before merging.
- Squash or merge per project convention; keep the subject line in Conventional Commit format.

---

## When to Update

Update this file when:

- The branch or merge workflow changes.
- New mandatory steps are added to the lifecycle (e.g., a required manual check).
- The hook chain changes significantly (summarise and link to [harness.md](harness.md)).
