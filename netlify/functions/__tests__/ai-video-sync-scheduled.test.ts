import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { aiVideoTask: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

const syncTask = vi.fn();
vi.mock("@/lib/ai-video-generation", () => ({
  syncTask: (...a: unknown[]) => syncTask(...a),
}));

import handler, { config, SWEEP_BUDGET_MS, SWEEP_CONCURRENCY } from "../ai-video-sync-scheduled";

const NOW = new Date("2026-10-05T12:00:00Z").getTime();

function tasks(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}` }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  findMany.mockReset();
  syncTask.mockReset();
  syncTask.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("netlify/functions/ai-video-sync-scheduled", () => {
  it("runs every 10 minutes", () => {
    expect(config.schedule).toBe("*/10 * * * *");
  });

  it("queries GENERATING tasks least-recently-checked first, and does nothing when empty", async () => {
    findMany.mockResolvedValue([]);
    await handler(new Request("http://localhost"), {} as never);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { status: "GENERATING" },
      orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
      select: { id: true },
    });
    expect(syncTask).not.toHaveBeenCalled();
  });

  it("syncs every task when there is time", async () => {
    findMany.mockResolvedValue(tasks(7));
    await handler(new Request("http://localhost"), {} as never);
    expect(syncTask).toHaveBeenCalledTimes(7);
    expect(syncTask.mock.calls.map((c) => c[0]).sort()).toEqual(
      ["t0", "t1", "t2", "t3", "t4", "t5", "t6"].sort()
    );
  });

  it(`runs at most ${SWEEP_CONCURRENCY} checks at a time`, async () => {
    findMany.mockResolvedValue(tasks(12));
    let inFlight = 0;
    let maxInFlight = 0;
    syncTask.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });

    await handler(new Request("http://localhost"), {} as never);

    expect(maxInFlight).toBe(SWEEP_CONCURRENCY);
    expect(syncTask).toHaveBeenCalledTimes(12);
  });

  it("starts no new check once the time budget is spent", async () => {
    findMany.mockResolvedValue(tasks(12));
    const startedAt: number[] = [];
    syncTask.mockImplementation(async () => {
      startedAt.push(Date.now());
      vi.advanceTimersByTime(6_000);
    });

    await handler(new Request("http://localhost"), {} as never);

    expect(syncTask.mock.calls.length).toBeGreaterThan(0);
    expect(syncTask.mock.calls.length).toBeLessThan(12);
    for (const t of startedAt) expect(t - NOW).toBeLessThan(SWEEP_BUDGET_MS);
  });

  it("keeps going when one task's sync throws", async () => {
    findMany.mockResolvedValue(tasks(3));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    syncTask.mockImplementation(async (id: string) => {
      if (id === "t0") throw new Error("boom");
    });

    await handler(new Request("http://localhost"), {} as never);

    expect(syncTask).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });
});
