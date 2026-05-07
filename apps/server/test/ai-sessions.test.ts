import { strict as assert } from "node:assert";
import { type AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import type { SessionRecord } from "../src/store.ts";

import { createHttpServer, type HttpServerHandle } from "../src/http.ts";

let handle: HttpServerHandle;
let baseUrl: string;
const aiLogLines: string[] = [];

before(async () => {
  handle = createHttpServer({
    ai: {
      delayMs: 0,
      moveTimeoutMs: 2_000,
      log: (line) => aiLogLines.push(line),
    },
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

async function jsonGet<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? (JSON.parse(text) as T) : (undefined as T) };
}

async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 3_000,
): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 25));
    last = await fn();
  }
  return last;
}

describe("/bots", () => {
  it("lists random and heuristic bots", async () => {
    const { status, body } = await jsonGet<Array<{ id: string; version: string; kind: string }>>("/bots");
    assert.equal(status, 200);
    const ids = body.map((b) => b.id).sort();
    assert.deepEqual(ids, ["heuristic-v1", "random-v1"]);
    for (const meta of body) assert.ok(meta.version.length > 0);
  });
});

describe("AI session play", () => {
  it("rejects unknown bot ids with 400", async () => {
    const { status, body } = await jsonPost<{ error: string }>("/sessions", {
      size: 9,
      players: { black: { kind: "human" }, white: { kind: "bot", id: "ghost-9000" } },
    });
    assert.equal(status, 400);
    assert.match(body.error, /Unknown bot id/);
  });

  it("derives mode from players and ignores any mode field on the input", async () => {
    const ok = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      players: { black: { kind: "human" }, white: { kind: "bot", id: "random-v1" } },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.mode, "humanVsAi");
    assert.equal(ok.body.players.white.kind, "bot");

    // A `mode` field on the input is silently ignored: mode is derived from players only.
    const ignored = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      mode: "humanVsHuman",
      players: { black: { kind: "human" }, white: { kind: "bot", id: "random-v1" } },
    });
    assert.equal(ignored.status, 201);
    assert.equal(ignored.body.mode, "humanVsAi");
  });

  it("plays a human move and the bot replies via the AI loop", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      players: { black: { kind: "human" }, white: { kind: "bot", id: "random-v1" } },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const move = await jsonPost<SessionRecord>(`/sessions/${id}/moves`, { x: 4, y: 4 });
    assert.equal(move.status, 200);
    assert.equal(move.body.game.moveNumber, 1);

    // The bot reply happens asynchronously; poll until move 2 lands.
    const final = await pollUntil(
      () => jsonGet<SessionRecord>(`/sessions/${id}`),
      (r) => r.body.game.moveNumber >= 2,
    );
    assert.equal(final.body.game.moveNumber, 2);
    assert.equal(final.body.game.current, 1); // BLACK's turn after white bot replied

    // AI move was logged with bot id and version.
    const aiLogs = aiLogLines
      .map((line) => JSON.parse(line) as { event: string; sessionId: string; bot: { id: string; version: string } })
      .filter((entry) => entry.event === "ai_move" && entry.sessionId === id);
    assert.ok(aiLogs.length >= 1);
    assert.equal(aiLogs[0].bot.id, "random-v1");
    assert.match(aiLogs[0].bot.version, /^\d+\.\d+\.\d+$/);
  });

  it("runs an AI vs AI game to completion", async () => {
    const created = await jsonPost<SessionRecord>("/sessions", {
      size: 9,
      players: {
        black: { kind: "bot", id: "random-v1" },
        white: { kind: "bot", id: "heuristic-v1" },
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.mode, "aiVsAi");
    const id = created.body.id;

    const final = await pollUntil(
      () => jsonGet<SessionRecord>(`/sessions/${id}`),
      (r) => r.body.game.gameOver === true,
      30_000,
    );
    assert.ok(final.body.game.gameOver);
    assert.ok(final.body.game.moveLog.length > 0);
    assert.ok(["B", "W"].some((c) => final.body.game.result.startsWith(c)));

    // SGF still works for AI-vs-AI.
    const sgfRes = await fetch(`${baseUrl}/sessions/${id}/sgf`);
    assert.equal(sgfRes.status, 200);
    const sgf = await sgfRes.text();
    assert.match(sgf, /^\(;GM\[1\]/);
  });
});

describe("bot-turn move protection", () => {
  it("rejects a human/API move during the bot's turn with 409", async () => {
    // Spin up an isolated server with a long delay so the bot does not move
    // before our probe.
    const localHandle = createHttpServer({
      ai: { delayMs: 5_000, moveTimeoutMs: 6_000, log: () => {} },
    });
    await new Promise<void>((resolve, reject) => {
      localHandle.server.once("error", reject);
      localHandle.server.listen(0, "127.0.0.1", () => {
        localHandle.server.off("error", reject);
        resolve();
      });
    });
    try {
      const addr = localHandle.server.address() as AddressInfo;
      const local = `http://127.0.0.1:${addr.port}`;

      const created = await fetch(`${local}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: 9,
          players: {
            black: { kind: "human" },
            white: { kind: "bot", id: "heuristic-v1" },
          },
        }),
      });
      assert.equal(created.status, 201);
      const session = (await created.json()) as SessionRecord;

      // Black (human) plays first.
      const blackMove = await fetch(`${local}/sessions/${session.id}/moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: 4, y: 4 }),
      });
      assert.equal(blackMove.status, 200);

      // Now it's the bot's turn (delayed). A direct API move must be refused.
      const stolen = await fetch(`${local}/sessions/${session.id}/moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: 2, y: 2 }),
      });
      assert.equal(stolen.status, 409);
      const stolenBody = (await stolen.json()) as { error: string };
      assert.match(stolenBody.error, /bot's turn/);

      // Pass and resign during the bot's turn must also be refused.
      const passRes = await fetch(`${local}/sessions/${session.id}/pass`, { method: "POST" });
      assert.equal(passRes.status, 409);
      const resignRes = await fetch(`${local}/sessions/${session.id}/resign`, { method: "POST" });
      assert.equal(resignRes.status, 409);
    } finally {
      await localHandle.close();
    }
  });
});

describe("stale AI decision protection", () => {
  it("drops bot decisions whose state moved on during think", async () => {
    // Use a slow bot wrapped via heuristic + long delay so we can interleave
    // a manual mutation. We do this through the service directly.
    const staleLogs: string[] = [];
    const localHandle = createHttpServer({
      ai: { delayMs: 200, moveTimeoutMs: 4_000, log: (line) => staleLogs.push(line) },
    });
    await new Promise<void>((resolve, reject) => {
      localHandle.server.once("error", reject);
      localHandle.server.listen(0, "127.0.0.1", () => {
        localHandle.server.off("error", reject);
        resolve();
      });
    });
    try {
      const addr = localHandle.server.address() as AddressInfo;
      const local = `http://127.0.0.1:${addr.port}`;

      const created = await fetch(`${local}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: 9,
          players: {
            black: { kind: "bot", id: "heuristic-v1" },
            white: { kind: "human" },
          },
        }),
      });
      assert.equal(created.status, 201);
      const session = (await created.json()) as SessionRecord;

      // Black is a bot and is "thinking" (200ms delay + getMove). Before its
      // decision is applied, mutate state via the service-internal pass for
      // the bot. We can do this by reaching into the handle.
      // Wait briefly so the bot enters its delay window.
      await new Promise((r) => setTimeout(r, 30));
      // Force a bot pass on its behalf to advance the moveNumber.
      localHandle.service.pass(session.id, { actor: "bot" });

      // Wait for the loop to evaluate its decision and emit a stale log.
      const deadline = Date.now() + 2_000;
      let saw = false;
      while (Date.now() < deadline) {
        const stale = staleLogs
          .map((line) => JSON.parse(line) as { event?: string; decision?: { type?: string } })
          .filter(
            (entry) =>
              entry.event === "ai_move" && entry.decision?.type === "stale",
          );
        if (stale.length > 0) {
          saw = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.ok(saw, "expected a stale-decision log line");
    } finally {
      await localHandle.close();
    }
  });
});

describe("bot resignation", () => {
  it("routes a {resign:true} controller move into service.resign and ends the game with +R", async () => {
    const logs: string[] = [];
    const localHandle = createHttpServer({
      ai: {
        delayMs: 0,
        moveTimeoutMs: 1_000,
        log: (line) => logs.push(line),
        // Override the registered "random-v1" bot with a stub that always
        // resigns. The session-creation path still validates against the
        // real registry, so we keep the public id stable.
        botFactory: (id) =>
          id === "random-v1"
            ? {
                id: "random-v1",
                label: "Random bot",
                version: "test",
                kind: "random",
                inferenceMode: "server",
                async getMove() {
                  return { resign: true };
                },
              }
            : null,
      },
    });
    await new Promise<void>((resolve, reject) => {
      localHandle.server.once("error", reject);
      localHandle.server.listen(0, "127.0.0.1", () => {
        localHandle.server.off("error", reject);
        resolve();
      });
    });
    try {
      const addr = localHandle.server.address() as AddressInfo;
      const local = `http://127.0.0.1:${addr.port}`;
      const created = await fetch(`${local}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: 9,
          players: {
            black: { kind: "bot", id: "random-v1" },
            white: { kind: "human" },
          },
        }),
      });
      assert.equal(created.status, 201);
      const session = (await created.json()) as SessionRecord;

      const deadline = Date.now() + 2_000;
      let final: SessionRecord | undefined;
      while (Date.now() < deadline) {
        final = localHandle.service.peek(session.id);
        if (final?.game.gameOver) break;
        await new Promise((r) => setTimeout(r, 15));
      }
      assert.ok(final?.game.gameOver, "expected game over after bot resign");
      // Black resigned, so white wins by R.
      assert.equal(final!.game.result, "W+R");

      const resignLog = logs
        .map((line) => JSON.parse(line) as { event?: string; decision?: { type?: string } })
        .find((entry) => entry.event === "ai_move" && entry.decision?.type === "resign");
      assert.ok(resignLog, "expected an ai_move log with decision.type === 'resign'");
    } finally {
      await localHandle.close();
    }
  });
});
