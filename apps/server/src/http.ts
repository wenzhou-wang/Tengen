import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";

import { listBotMetadata } from "@tengen/ai-bots";

import { AiMoveLoop, type AiLoopOptions } from "./aiLoop.ts";
import { attachSseStream, EventBus } from "./events.ts";
import { HttpError, SessionService } from "./sessions.ts";
import { InMemorySessionStore, type SessionStore } from "./store.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
};

interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  service: SessionService;
  bus: EventBus;
  ai: AiMoveLoop;
}

type RouteHandler = (ctx: RouteContext, params: Record<string, string>) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

function defineRoute(method: string, path: string, handler: RouteHandler): Route {
  const paramNames: string[] = [];
  const regex = path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return {
    method,
    pattern: new RegExp(`^${regex}$`),
    paramNames,
    handler,
  };
}

async function readJsonObjectBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 1_000_000) {
        reject(new HttpError(413, "Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        reject(new HttpError(400, "Invalid JSON body."));
        return;
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        reject(new HttpError(400, "Request body must be a JSON object."));
        return;
      }
      resolve(parsed as Record<string, unknown>);
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...CORS_HEADERS,
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    ...CORS_HEADERS,
  });
  res.end(body);
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Internal server error.";
  sendJson(res, 500, { error: message });
}

export interface CreateHttpServerOptions {
  store?: SessionStore;
  bus?: EventBus;
  ai?: AiLoopOptions;
}

export interface HttpServerHandle {
  server: Server;
  service: SessionService;
  bus: EventBus;
  store: SessionStore;
  ai: AiMoveLoop;
  close(): Promise<void>;
}

export function createHttpServer(options: CreateHttpServerOptions = {}): HttpServerHandle {
  const store = options.store ?? new InMemorySessionStore();
  const bus = options.bus ?? new EventBus();
  const service = new SessionService(store, bus);
  const ai = new AiMoveLoop(service, options.ai);

  const routes: Route[] = [
    defineRoute("GET", "/health", ({ res }) => {
      sendJson(res, 200, { ok: true });
    }),
    defineRoute("GET", "/bots", ({ res }) => {
      sendJson(res, 200, listBotMetadata());
    }),
    defineRoute("POST", "/sessions", async ({ req, res, service, ai }) => {
      const body = await readJsonObjectBody(req);
      const size = typeof body.size === "number" ? body.size : undefined;
      const players =
        body.players && typeof body.players === "object" && !Array.isArray(body.players)
          ? (body.players as { black?: { kind?: string; id?: string }; white?: { kind?: string; id?: string } })
          : undefined;
      const session = service.create({ size, players });
      sendJson(res, 201, session);
      ai.schedule(session);
    }),
    defineRoute("GET", "/sessions", ({ res, service }) => {
      sendJson(res, 200, service.store.list());
    }),
    defineRoute("GET", "/sessions/:id", ({ res, service }, params) => {
      sendJson(res, 200, service.get(params.id));
    }),
    defineRoute("POST", "/sessions/:id/moves", async ({ req, res, service, ai }, params) => {
      const body = await readJsonObjectBody(req);
      if (typeof body.x !== "number" || typeof body.y !== "number") {
        throw new HttpError(400, "Move requires numeric x and y.");
      }
      const session = service.playMove(params.id, body.x, body.y);
      sendJson(res, 200, session);
      ai.schedule(session);
    }),
    defineRoute("POST", "/sessions/:id/pass", ({ res, service, ai }, params) => {
      const session = service.pass(params.id);
      sendJson(res, 200, session);
      ai.schedule(session);
    }),
    defineRoute("POST", "/sessions/:id/resign", ({ res, service }, params) => {
      sendJson(res, 200, service.resign(params.id));
    }),
    defineRoute("POST", "/sessions/:id/undo", ({ res, service, ai }, params) => {
      const session = service.undo(params.id);
      sendJson(res, 200, session);
      ai.schedule(session);
    }),
    defineRoute("GET", "/sessions/:id/sgf", ({ res, service }, params) => {
      sendText(res, 200, service.exportSgf(params.id), "application/x-go-sgf; charset=utf-8");
    }),
    defineRoute("GET", "/sessions/:id/events", ({ res, service, bus }, params) => {
      const session = service.get(params.id);
      attachSseStream(res, bus, params.id, { type: "state", session });
    }),
  ];

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "Bad request." });
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      try {
        await route.handler({ req, res, url, service, bus, ai }, params);
      } catch (error) {
        sendError(res, error);
      }
      return;
    }

    sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  });

  return {
    server,
    service,
    bus,
    store,
    ai,
    close: () =>
      new Promise<void>((resolve, reject) => {
        ai.dispose();
        server.close((err) => (err ? reject(err) : resolve()));
        // SSE responses are long-lived "active" requests; without this they
        // would block server.close() until every browser tab disconnects.
        server.closeAllConnections();
      }),
  };
}
