#!/usr/bin/env tsx
import { execSync } from "node:child_process";

const COMPOSE = "docker compose -p brand-creator-e2e -f docker/compose.e2e.yml";
const REBUILDABLE = ["web", "api"] as const;
type Service = (typeof REBUILDABLE)[number];

function parseService(argv: readonly string[]): Service | null {
  const arg = argv[2];
  if (!arg) return null;
  if ((REBUILDABLE as readonly string[]).includes(arg)) return arg as Service;
  console.error(
    `[e2e:rebuild] unknown service "${arg}". Expected one of: ${REBUILDABLE.join(", ")} (or omit for all).`
  );
  process.exit(1);
}

function main(): void {
  const service = parseService(process.argv);
  const target = service ?? "(all services)";
  console.log(`[e2e:rebuild] rebuilding ${target}…`);
  const cmd = service
    ? `${COMPOSE} up -d --build --wait ${service}`
    : `${COMPOSE} up -d --build --wait`;
  execSync(cmd, { stdio: "inherit" });
  console.log(`[e2e:rebuild] ${target} ready.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
