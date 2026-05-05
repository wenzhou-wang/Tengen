import { strict as assert } from "node:assert";
import { type AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import type { SessionRecord } from "../src/store.ts";

import { createHttpServer, type HttpServerHandle } from "../src/http.ts";

let handle: HttpServerHandle;
let baseUrl: string;

before(async () => {
  handle = createHttpServer();
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

async function jsonFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
  return { status: res.status, body };
}

describe("session lifecycle", () => {
  let session: SessionRecord;

  it("creates a 9x9 human-vs-human session", async () => {
    const { status, body } = await jsonFetch<SessionRecord>("/sessions", {
      method: "POST",
      body: JSON.stringify({ size: 9, mode: "humanVsHuman" }),
    });
    assert.equal(status, 201);
    assert.equal(body.size, 9);
    assert.equal(body.mode, "humanVsHuman");
    assert.equal(body.game.moveNumber, 0);
    session = body;
  });

  it("rejects unsupported board sizes", async () => {
    const { status, body } = await jsonFetch<{ error: string }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ size: 7 }),
    });
    assert.equal(status, 400);
    assert.match(body.error, /Unsupported board size/);
  });

  it("fetches the session by id", async () => {
    const { status, body } = await jsonFetch<SessionRecord>(`/sessions/${session.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, session.id);
  });

  it("returns 404 for unknown sessions", async () => {
    const { status } = await jsonFetch(`/sessions/does-not-exist`);
    assert.equal(status, 404);
  });

  it("plays a legal move", async () => {
    const { status, body } = await jsonFetch<SessionRecord>(`/sessions/${session.id}/moves`, {
      method: "POST",
      body: JSON.stringify({ x: 4, y: 4 }),
    });
    assert.equal(status, 200);
    assert.equal(body.game.moveNumber, 1);
    assert.equal(body.game.board[4][4], 1); // BLACK
    assert.equal(body.game.current, 2); // WHITE
    session = body;
  });

  it("rejects an illegal move (occupied intersection)", async () => {
    const { status, body } = await jsonFetch<{ error: string }>(`/sessions/${session.id}/moves`, {
      method: "POST",
      body: JSON.stringify({ x: 4, y: 4 }),
    });
    assert.equal(status, 409);
    assert.match(body.error, /occupied/i);
  });

  it("rejects an off-board move", async () => {
    const { status, body } = await jsonFetch<{ error: string }>(`/sessions/${session.id}/moves`, {
      method: "POST",
      body: JSON.stringify({ x: 99, y: 99 }),
    });
    assert.equal(status, 409);
    assert.match(body.error, /outside/i);
  });

  it("rejects a malformed move payload", async () => {
    const { status } = await jsonFetch(`/sessions/${session.id}/moves`, {
      method: "POST",
      body: JSON.stringify({ x: "a", y: 1 }),
    });
    assert.equal(status, 400);
  });

  it("rejects non-object JSON bodies with 400", async () => {
    for (const payload of ["null", "[]", "42", '"hello"']) {
      const { status, body } = await jsonFetch<{ error: string }>("/sessions", {
        method: "POST",
        body: payload,
      });
      assert.equal(status, 400, `expected 400 for body ${payload}`);
      assert.match(body.error, /JSON object/);
    }
  });

  it("undoes the last move", async () => {
    const { status, body } = await jsonFetch<SessionRecord>(`/sessions/${session.id}/undo`, {
      method: "POST",
    });
    assert.equal(status, 200);
    assert.equal(body.game.moveNumber, 0);
    session = body;
  });

  it("passes and ends the game on second pass", async () => {
    let res = await jsonFetch<SessionRecord>(`/sessions/${session.id}/pass`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.body.game.gameOver, false);

    res = await jsonFetch<SessionRecord>(`/sessions/${session.id}/pass`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.body.game.gameOver, true);
    assert.equal(res.body.game.phase, "scoring");
    session = res.body;
  });

  it("exports SGF for the session", async () => {
    const res = await fetch(`${baseUrl}/sessions/${session.id}/sgf`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /sgf/);
    const sgf = await res.text();
    assert.match(sgf, /^\(;GM\[1\]/);
    assert.match(sgf, /SZ\[9\]/);
  });

  it("rejects passes after the game ended", async () => {
    const { status, body } = await jsonFetch<{ error: string }>(`/sessions/${session.id}/pass`, {
      method: "POST",
    });
    assert.equal(status, 409);
    assert.match(body.error, /already over/i);
  });

  it("supports OPTIONS preflight with CORS headers", async () => {
    const res = await fetch(`${baseUrl}/sessions`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });
});

describe("SSE event stream", () => {
  it("delivers an initial state event and a subsequent move event", async () => {
    // Create a fresh session.
    const { body: created } = await jsonFetch<SessionRecord>("/sessions", {
      method: "POST",
      body: JSON.stringify({ size: 9 }),
    });
    const sessionId = created.id;

    // Open the SSE stream.
    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/sessions/${sessionId}/events`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get("content-type") ?? "", /text\/event-stream/);

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    const events: string[] = [];

    const readUntil = async (predicate: () => boolean, timeoutMs: number) => {
      const start = Date.now();
      while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error("SSE timeout");
        const { value, done } = await reader.read();
        if (done) break;
        events.push(decoder.decode(value, { stream: true }));
      }
    };

    // Initial event should arrive immediately.
    await readUntil(() => events.join("").includes("event: state"), 1000);

    // Trigger a move; expect another state event over SSE.
    const beforeMoveLength = events.join("").length;
    await jsonFetch(`/sessions/${sessionId}/moves`, {
      method: "POST",
      body: JSON.stringify({ x: 2, y: 3 }),
    });
    await readUntil(() => events.join("").length > beforeMoveLength, 1000);

    const combined = events.join("");
    // Two state events: initial + after-move.
    const stateEventCount = (combined.match(/event: state/g) ?? []).length;
    assert.ok(stateEventCount >= 2, `expected >=2 state events, got ${stateEventCount}`);
    assert.ok(combined.includes(`"moveNumber":1`));

    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
});
