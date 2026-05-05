import { createHttpServer } from "./http.ts";

const port = Number(process.env.PORT ?? 4000);
const handle = createHttpServer();

handle.server.listen(port, () => {
  const address = handle.server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`tengen server listening on http://localhost:${actualPort}`);
});

const shutdown = async (signal: string) => {
  console.log(`\nreceived ${signal}, shutting down`);
  await handle.close().catch((err) => {
    console.error("error during shutdown:", err);
  });
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
