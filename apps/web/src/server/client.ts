import type { GameState } from "@tengen/game-core";

export type SessionMode = "humanVsHuman" | "humanVsAi" | "aiVsAi";

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  size: 9 | 13 | 19;
  createdAt: string;
  updatedAt: string;
  game: GameState;
}

export interface CreateSessionInput {
  size: 9 | 13 | 19;
  mode?: SessionMode;
}

export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

const DEFAULT_BASE_URL =
  (import.meta.env.VITE_TENGEN_SERVER_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:4000";

async function jsonRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text.length > 0 ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = (body as { error?: string } | undefined)?.error ?? `Request failed (${res.status}).`;
    throw new ServerError(res.status, message);
  }
  return body as T;
}

export class TengenServerClient {
  constructor(readonly baseUrl: string = DEFAULT_BASE_URL) {}

  createSession(input: CreateSessionInput): Promise<SessionRecord> {
    return jsonRequest<SessionRecord>(`${this.baseUrl}/sessions`, {
      method: "POST",
      body: JSON.stringify({ size: input.size, mode: input.mode ?? "humanVsHuman" }),
    });
  }

  getSession(id: string): Promise<SessionRecord> {
    return jsonRequest<SessionRecord>(`${this.baseUrl}/sessions/${encodeURIComponent(id)}`);
  }

  playMove(id: string, x: number, y: number): Promise<SessionRecord> {
    return jsonRequest<SessionRecord>(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/moves`, {
      method: "POST",
      body: JSON.stringify({ x, y }),
    });
  }

  pass(id: string): Promise<SessionRecord> {
    return jsonRequest<SessionRecord>(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/pass`, {
      method: "POST",
    });
  }

  resign(id: string): Promise<SessionRecord> {
    return jsonRequest<SessionRecord>(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/resign`, {
      method: "POST",
    });
  }

  undo(id: string): Promise<SessionRecord> {
    return jsonRequest<SessionRecord>(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/undo`, {
      method: "POST",
    });
  }

  async exportSgf(id: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/sgf`);
    if (!res.ok) {
      throw new ServerError(res.status, `SGF request failed (${res.status}).`);
    }
    return res.text();
  }

  subscribe(id: string, onState: (session: SessionRecord) => void): () => void {
    const source = new EventSource(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/events`);
    const stateHandler = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as { type: string; session?: SessionRecord };
        if (parsed.type === "state" && parsed.session) onState(parsed.session);
      } catch {
        // Ignore malformed payloads.
      }
    };
    source.addEventListener("state", stateHandler as EventListener);
    return () => {
      source.removeEventListener("state", stateHandler as EventListener);
      source.close();
    };
  }
}

export const tengenServer = new TengenServerClient();
