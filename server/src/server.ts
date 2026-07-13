import type {
  ClientToServerEvents,
  HealthResponse,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@ashes/shared";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server as SocketServer } from "socket.io";
import { env } from "./env.js";
import { attachSocketGateway } from "./network/socketGateway.js";
import { RoomManager } from "./rooms/RoomManager.js";

export interface CreateGameServerOptions {
  clientOrigins?: readonly string[];
  nowProvider?: () => number;
  stateFile?: string | null;
}

export interface GameServer {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  rooms: RoomManager;
  start: (port?: number, host?: string) => Promise<number>;
  stop: () => Promise<void>;
}

export const createGameServer = (options: CreateGameServerOptions = {}): GameServer => {
  const origins = options.clientOrigins ?? env.clientOrigins;
  const app = express();
  const httpServer = createServer(app);
  const rooms = new RoomManager(options.nowProvider, options.stateFile === undefined ? env.stateFile : options.stateFile);
  const corsOrigin = (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void): void => {
    if (!origin || origins.includes("*") || origins.includes(origin)) callback(null, true);
    else callback(new Error("Origin is not allowed by CORS"));
  };

  app.disable("x-powered-by");
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_request, response) => {
    const body: HealthResponse = {
      status: "ok",
      service: "ashes-server",
      uptime: process.uptime(),
      rooms: rooms.size,
      players: rooms.playerCount,
      timestamp: Date.now(),
    };
    response.status(200).json(body);
  });

  if (env.nodeEnv === "production") {
    const clientDistPath = fileURLToPath(new URL("../../client/dist", import.meta.url));
    const clientIndexPath = fileURLToPath(new URL("../../client/dist/index.html", import.meta.url));
    if (existsSync(clientIndexPath)) {
      app.use(express.static(clientDistPath, { index: false, maxAge: "1h" }));
      app.get("*", (request, response, next) => {
        if (request.path.startsWith("/socket.io")) {
          next();
          return;
        }
        response.sendFile(clientIndexPath);
      });
    }
  }

  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    transports: ["websocket", "polling"],
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 64 * 1_024,
  });
  const gateway = attachSocketGateway(io, rooms, options.nowProvider);

  const start = async (port = env.port, host = env.host): Promise<number> => {
    if (httpServer.listening) {
      const address = httpServer.address();
      return typeof address === "object" && address ? address.port : port;
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
    const address = httpServer.address();
    return typeof address === "object" && address ? address.port : port;
  };

  const stop = async (): Promise<void> => {
    rooms.persist();
    gateway.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { app, httpServer, io, rooms, start, stop };
};
