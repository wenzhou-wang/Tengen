import type { ServerResponse } from "node:http";

import type { SessionRecord } from "./store.ts";

export type SessionEvent =
  | { type: "state"; session: SessionRecord }
  | { type: "closed"; sessionId: string };

type Subscriber = (event: SessionEvent) => void;

export class EventBus {
  readonly #bySession = new Map<string, Set<Subscriber>>();

  subscribe(sessionId: string, subscriber: Subscriber): () => void {
    let set = this.#bySession.get(sessionId);
    if (!set) {
      set = new Set();
      this.#bySession.set(sessionId, set);
    }
    set.add(subscriber);
    return () => {
      set?.delete(subscriber);
      if (set && set.size === 0) {
        this.#bySession.delete(sessionId);
      }
    };
  }

  publish(sessionId: string, event: SessionEvent): void {
    const set = this.#bySession.get(sessionId);
    if (!set) return;
    for (const sub of set) {
      try {
        sub(event);
      } catch {
        // Subscribers must not throw past the bus; ignore individual failures.
      }
    }
  }

  subscriberCount(sessionId: string): number {
    return this.#bySession.get(sessionId)?.size ?? 0;
  }
}

export function attachSseStream(
  res: ServerResponse,
  bus: EventBus,
  sessionId: string,
  initial: SessionEvent,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const send = (event: SessionEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send(initial);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15_000);
  // Don't keep the event loop alive just for heartbeats.
  heartbeat.unref?.();

  const unsubscribe = bus.subscribe(sessionId, send);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  res.on("close", cleanup);
  res.on("error", cleanup);
}
