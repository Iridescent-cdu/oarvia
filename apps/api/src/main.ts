import { once } from "node:events";

import { readConfig } from "./config";
import { createApiServer } from "./server";

const config = readConfig(process.env);
const server = createApiServer();

server.on("error", (error) => {
  console.error("API server failed", error);
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  console.info(`Oarvia API listening on http://${config.host}:${config.port}`);
});

const shutdown = async () => {
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  timeout.unref();
  try {
    const closed = once(server, "close");
    server.close();
    await closed;
  } finally {
    clearTimeout(timeout);
  }
};

const stop = async () => {
  try {
    await shutdown();
  } catch (error) {
    console.error("API shutdown failed", error);
    process.exitCode = 1;
  }
};

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
