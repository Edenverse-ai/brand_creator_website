#!/usr/bin/env node
// ⚠️ Intentionally NOT wired into lint-staged.
// Per-file mypy invocation produces false positives on Pydantic model classes
// because each model needs the rest of the package to resolve its base class.
// Full mypy runs at push (see `harness:prepush`).
// This script is preserved for future use once Pydantic stub coverage improves
// (e.g., once mypy strict mode is achievable). See docs/backend.md for rationale.
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args.length === 0) process.exit(0);

const r = spawnSync(
  "backend/.venv/bin/mypy",
  ["--config-file", "backend/pyproject.toml", ...args],
  {
    stdio: "inherit",
  }
);
if (r.status !== 0) {
  console.error("\n[mypy] type errors. Fix or `# type: ignore[<code>]` with a TODO.");
  console.error("See: docs/backend.md\n");
  process.exit(r.status);
}
