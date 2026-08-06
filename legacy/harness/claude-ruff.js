#!/usr/bin/env node
let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () => {
  try {
    const i = JSON.parse(d);
    const f = i.tool_input?.file_path;
    if (!f || !/backend\/.+\.py$/.test(f)) return;
    const cp = require("node:child_process");
    const ruffBin = "backend/.venv/bin/ruff";
    if (!require("node:fs").existsSync(ruffBin)) return; // venv missing — silent skip
    cp.spawnSync(ruffBin, ["format", f], { stdio: "inherit" });
    cp.spawnSync(ruffBin, ["check", "--fix", f], { stdio: "inherit" });
  } catch (e) {
    console.error(e);
  }
});
