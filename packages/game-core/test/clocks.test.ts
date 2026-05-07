import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  applyElapsed,
  createInitialClocks,
  createInitialPlayerClock,
  isUnlimitedTimeControl,
  projectRemainingMs,
  timeUntilLossMs,
  type TimeControl,
} from "../src/clocks.ts";

const TC: TimeControl = { mainTimeSeconds: 60, byoyomiSeconds: 30 };

describe("clocks: applyElapsed", () => {
  it("deducts main time when not in byoyomi", () => {
    const c = createInitialPlayerClock(TC);
    const r = applyElapsed(c, 10_000, TC);
    assert.equal(r.lostOnTime, false);
    assert.equal(r.clock.inByoyomi, false);
    assert.equal(r.clock.mainRemainingMs, 50_000);
  });

  it("transitions to byoyomi when main time exhausted, not lost yet", () => {
    const c = createInitialPlayerClock(TC);
    const r = applyElapsed(c, 75_000, TC);
    assert.equal(r.lostOnTime, false);
    assert.equal(r.clock.inByoyomi, true);
    assert.equal(r.clock.mainRemainingMs, 0);
  });

  it("loses when single-move spend exceeds main + byoyomi", () => {
    const c = createInitialPlayerClock(TC);
    const r = applyElapsed(c, 60_000 + 30_001, TC);
    assert.equal(r.lostOnTime, true);
    assert.equal(r.clock.lostOnTime, true);
  });

  it("loses if a byoyomi move exceeds the per-move budget", () => {
    const c = { mainRemainingMs: 0, inByoyomi: true, lostOnTime: false };
    const r = applyElapsed(c, 30_500, TC);
    assert.equal(r.lostOnTime, true);
  });

  it("does not lose if exactly at the byoyomi budget", () => {
    const c = { mainRemainingMs: 0, inByoyomi: true, lostOnTime: false };
    const r = applyElapsed(c, 30_000, TC);
    assert.equal(r.lostOnTime, false);
    assert.equal(r.clock.inByoyomi, true);
  });

  it("preserves lost state across calls", () => {
    const lost = { mainRemainingMs: 0, inByoyomi: true, lostOnTime: true };
    const r = applyElapsed(lost, 1_000, TC);
    assert.equal(r.lostOnTime, true);
  });
});

describe("clocks: projectRemainingMs", () => {
  it("ticks main time down", () => {
    const c = createInitialPlayerClock(TC);
    const p = projectRemainingMs(c, TC, 25_000);
    assert.equal(p.inByoyomi, false);
    assert.equal(p.mainRemainingMs, 35_000);
  });

  it("flips to byoyomi and ticks byoyomi remaining", () => {
    const c = createInitialPlayerClock(TC);
    const p = projectRemainingMs(c, TC, 70_000);
    assert.equal(p.inByoyomi, true);
    assert.equal(p.mainRemainingMs, 0);
    assert.equal(p.byoyomiRemainingMs, 20_000);
    assert.equal(p.willLose, false);
  });

  it("reports willLose at zero byoyomi remaining", () => {
    const c = { mainRemainingMs: 0, inByoyomi: true, lostOnTime: false };
    const p = projectRemainingMs(c, TC, 30_000);
    assert.equal(p.byoyomiRemainingMs, 0);
    assert.equal(p.willLose, true);
  });
});

describe("clocks: timeUntilLossMs", () => {
  it("is infinity for unlimited time control", () => {
    assert.equal(timeUntilLossMs(createInitialPlayerClock(TC), { mainTimeSeconds: 0, byoyomiSeconds: 0 }), Number.POSITIVE_INFINITY);
  });

  it("equals byoyomi when in byoyomi", () => {
    const c = { mainRemainingMs: 0, inByoyomi: true, lostOnTime: false };
    assert.equal(timeUntilLossMs(c, TC), 30_000);
  });

  it("equals main + byoyomi when in main", () => {
    const c = createInitialPlayerClock(TC);
    assert.equal(timeUntilLossMs(c, TC), 90_000);
  });
});

describe("clocks: createInitialClocks + isUnlimited", () => {
  it("starts both players with full main time", () => {
    const c = createInitialClocks(TC, 1_000);
    assert.equal(c.black.mainRemainingMs, 60_000);
    assert.equal(c.white.mainRemainingMs, 60_000);
    assert.equal(c.turnStartedAt, 1_000);
  });

  it("treats {0,0} as unlimited", () => {
    assert.equal(isUnlimitedTimeControl({ mainTimeSeconds: 0, byoyomiSeconds: 0 }), true);
    assert.equal(isUnlimitedTimeControl(null), true);
    assert.equal(isUnlimitedTimeControl(TC), false);
  });
});
