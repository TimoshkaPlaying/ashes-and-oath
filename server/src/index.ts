import { env } from "./env.js";
import { createGameServer } from "./server.js";

const gameServer = createGameServer();

gameServer
  .start(env.port, env.host)
  .then((port) => {
    console.log(`Ashes & Oath server listening on http://${env.host}:${port}`);
  })
  .catch((error: unknown) => {
    console.error("Failed to start server", error);
    process.exitCode = 1;
  });

const shutdown = async (): Promise<void> => {
  await gameServer.stop();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

export { createGameServer } from "./server.js";
export { GameRoom } from "./game/GameRoom.js";
export { RoomManager } from "./rooms/RoomManager.js";
