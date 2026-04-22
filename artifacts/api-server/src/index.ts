import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachSocket } from "./poker/socket";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
attachSocket(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + Socket.IO)");
});
