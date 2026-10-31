import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp({ config });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting_down");
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error({ error_name: error instanceof Error ? error.name : "unknown" }, "listen_failed");
  process.exit(1);
}
