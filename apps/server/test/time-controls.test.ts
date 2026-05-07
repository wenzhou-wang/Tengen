import { strict as assert } from "node:assert";
import { type AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import type { SessionRecord } from "../src/store.ts";

import { createHttpServer, type HttpServerHandle } from "../src/http.ts";

let handle: HttpServerHandle;
let baseUrl: string;

before(async () => {
  handle = createHttpServer({
    ai: { delayMs: 0, defaultMoveTimeoutMs: 2_000, log: () => {} },
  });
  await new Promise<void>((resolve, reject) => {
    handle.server.once("error", reject);
    handle.server.listen(0, "127.0.0.1", () => {
      handle.server.off("error", reject);
      resolve();
    });
  });
  const addr = handle.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await handle.close();
});

async function jsonPost<T = unknown>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text.length > 0 ? (JSON.parse(text) as T) : (undefined as T),
  };
}

async function getSgf(id: string): Promise<string> {
  const res = await fetch(`${baseUrl}/sessions/${id}/sgf`);
  return res.text();
}

async function pollUntil<T>(
  fn: () => SessionRecord | undefined,
  predicate: (value: SessionRecord) => boolean,
  timeoutMs = 2_000,
): Promise<SessionRecord> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value && predicate(value)) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe("time control: session creation", () => {
  it("treats omitted timeControl as unlimited (null clocks)", async () => {
    const { status, body } = await jsonPost<SessionRecord>("/sessions", { size: 9 });
    assert.equal(status, 201);
    assert.equal(body.timeControl, null);
    assert.equal(body.clocks, null);
  });

  it("creates a session with main + byoyomi clocks", async () => {
    const { status, body } = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 60, byoyomiSeconds: 30 },
    });
    assert.equal(status, 201);
    assert.deepEqual(body.timeControl, { mainTimeSeconds: 60, byoyomiSeconds: 30 });
    assert.ok(body.clocks);
    assert.equal(body.clocks!.black.mainRemainingMs, 60_000);
    assert.equal(body.clocks!.white.mainRemainingMs, 60_000);
    assert.equal(typeof body.clocks!.turnStartedAt, "number");
  });

  it("rejects negative time control values", async () => {
    const { status, body } = await jsonPost<{ error: string }>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: -1, byoyomiSeconds: 30 },
    });
    assert.equal(status, 400);
    assert.match(body.error, /non-negative/i);
  });

  it("treats {0,0} as unlimited", async () => {
    const { status, body } = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 0, byoyomiSeconds: 0 },
    });
    assert.equal(status, 201);
    assert.equal(body.timeControl, null);
  });
});

describe("time control: per-move clock deduction", () => {
  it("deducts main time on the moving player after each move", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 60, byoyomiSeconds: 30 },
    });
    const id = created.body.id;

    const beforeBlack = created.body.clocks!.black.mainRemainingMs;
    // Wait briefly so an observable amount of time passes.
    await new Promise((r) => setTimeout(r, 80));
    const afterMove = await jsonPost<SessionRecord>(`/sessions/${id}/moves`, { x: 4, y: 4 });
    assert.equal(afterMove.status, 200);
    const afterBlack = afterMove.body.clocks!.black.mainRemainingMs;
    assert.ok(
      afterBlack < beforeBlack,
      `expected black main time to decrease (${beforeBlack} → ${afterBlack})`,
    );
    // White's clock should be unchanged (their turn just started).
    assert.equal(afterMove.body.clocks!.white.mainRemainingMs, 60_000);
    // turnStartedAt should be updated for white's turn.
    assert.ok(afterMove.body.clocks!.turnStartedAt! >= created.body.clocks!.turnStartedAt!);
  });
});

describe("time control: time-loss enforcement", () => {
  it("ends the game with B+T when the timeout watcher fires for white", async () => {
    // Tiny budgets so the test is fast: 0 main, 0.2s byoyomi.
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 0, byoyomiSeconds: 1 },
    });
    const id = created.body.id;

    // Black plays so it's white's turn.
    await jsonPost<SessionRecord>(`/sessions/${id}/moves`, { x: 4, y: 4 });

    // Wait past white's byoyomi budget; the watcher should fire.
    await pollUntil(
      () => handle.service.peek(id),
      (s) => s.game.gameOver,
      5_000,
    );
    const final = handle.service.peek(id)!;
    assert.equal(final.game.gameOver, true);
    assert.equal(final.game.result, "B+T");
    assert.equal(final.clocks!.white.lostOnTime, true);
  });

  it("rejects further moves once a player has lost on time", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 0, byoyomiSeconds: 1 },
    });
    const id = created.body.id;
    await jsonPost<SessionRecord>(`/sessions/${id}/moves`, { x: 0, y: 0 });
    await pollUntil(
      () => handle.service.peek(id),
      (s) => s.game.gameOver,
      5_000,
    );

    const tryMove = await jsonPost<{ error: string }>(`/sessions/${id}/moves`, { x: 1, y: 1 });
    assert.equal(tryMove.status, 409);
    assert.match(tryMove.body.error, /already over/i);
  });

  it("rejects undo after a time-loss result", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 0, byoyomiSeconds: 1 },
    });
    const id = created.body.id;
    await jsonPost<SessionRecord>(`/sessions/${id}/moves`, { x: 2, y: 2 });
    await pollUntil(
      () => handle.service.peek(id),
      (s) => s.game.gameOver,
      5_000,
    );

    const tryUndo = await jsonPost<{ error: string }>(`/sessions/${id}/undo`, {});
    assert.equal(tryUndo.status, 409);
    assert.match(tryUndo.body.error, /time-loss/i);
    // The session must remain terminal.
    const after = handle.service.peek(id)!;
    assert.equal(after.game.gameOver, true);
    assert.match(after.game.result, /\+T$/);
  });
});

describe("time control: SGF export", () => {
  it("includes TM and OT tags when time control is set", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      timeControl: { mainTimeSeconds: 1800, byoyomiSeconds: 30 },
    });
    const sgf = await getSgf(created.body.id);
    assert.match(sgf, /TM\[1800\]/);
    assert.match(sgf, /OT\[1x30 byo-yomi\]/);
  });

  it("omits TM/OT for unlimited games", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", { size: 9 });
    const sgf = await getSgf(created.body.id);
    assert.doesNotMatch(sgf, /TM\[/);
    assert.doesNotMatch(sgf, /OT\[/);
  });
});
