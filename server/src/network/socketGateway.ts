import {
  MATCH_CONFIG,
  type ClientToServerEvents,
  type GameCommand,
  type GameCommandResult,
  type InterServerEvents,
  type KingdomCustomization,
  type RoomError,
  type RoomJoined,
  type ServerToClientEvents,
  type SocketData,
} from "@ashes/shared";
import type { Server, Socket } from "socket.io";
import type { GameRoom } from "../game/GameRoom.js";
import { RoomActionError } from "../rooms/errors.js";
import { hashPassword, RoomManager, type ManagedPlayer } from "../rooms/RoomManager.js";
import { SlidingWindowRateLimiter } from "./rateLimiter.js";
import {
  gameCommandSchema,
  lobbyPlayerActionSchema,
  lobbyReadySchema,
  lobbyRoomSettingsSchema,
  lobbyUpdateSchema,
  pingSchema,
  rematchSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomResumeSchema,
} from "./validation.js";

type GameIo = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const invalidRequest = (message = "Некорректные данные запроса"): RoomError => ({
  code: "INVALID_REQUEST",
  message,
});

const toRoomError = (caught: unknown): RoomError => {
  if (caught instanceof RoomActionError) return { code: caught.code, message: caught.message };
  return { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" };
};

const sendRoomError = (socket: GameSocket, error: RoomError, ack?: (response: RoomJoined | RoomError) => void): void => {
  socket.emit("room:error", error);
  ack?.(error);
};

const makeJoined = (managed: ManagedPlayer, resumed: boolean, now: number): RoomJoined => ({
  code: managed.room.code,
  playerId: managed.playerId,
  reconnectToken: managed.reconnectToken,
  resumed,
  lobby: managed.room.getLobbyState(now),
});

const bindSocket = async (socket: GameSocket, managed: ManagedPlayer): Promise<void> => {
  socket.data.roomCode = managed.room.code;
  socket.data.playerId = managed.playerId;
  socket.data.reconnectToken = managed.reconnectToken;
  await socket.join(managed.room.code);
};

export interface SocketGateway {
  close: () => void;
}

export const attachSocketGateway = (io: GameIo, rooms: RoomManager, nowProvider: () => number = Date.now): SocketGateway => {
  const limiter = new SlidingWindowRateLimiter();
  let lastSnapshotAt = 0;
  const broadcastRooms = (now = nowProvider()): void => {
    io.emit("rooms:updated", rooms.publicRooms(now));
  };

  const emitSnapshots = (room: GameRoom, now: number): void => {
    if (room.status === "lobby") return;
    for (const player of room.players) {
      if (!player.connected || !player.socketId) continue;
      try {
        io.to(player.socketId).emit("game:snapshot", room.createSnapshot(player.playerId, now));
      } catch {
        // The room can transition while a socket is leaving; the next tick will reconcile it.
      }
    }
  };

  const flushRoom = (room: GameRoom, now: number, includeSnapshot = false): void => {
    for (const event of room.drainEvents()) {
      for (const player of room.players) {
        if (!player.connected || !player.socketId || !room.isEventVisibleTo(player.playerId, event)) continue;
        io.to(player.socketId).emit("game:event", event);
      }
    }
    if (includeSnapshot) emitSnapshots(room, now);
  };

  io.on("connection", (socket) => {
    socket.emit("rooms:updated", rooms.publicRooms(nowProvider()));
    socket.on("rooms:list", () => socket.emit("rooms:updated", rooms.publicRooms(nowProvider())));

    socket.on("room:create", async (raw, ack) => {
      const now = nowProvider();
      if (!limiter.allow(`${socket.id}:room`, 8, 5_000, now)) {
        sendRoomError(socket, { code: "RATE_LIMITED", message: "Слишком много запросов" }, ack);
        return;
      }
      const parsed = roomCreateSchema.safeParse(raw);
      if (!parsed.success) {
        sendRoomError(socket, invalidRequest(), ack);
        return;
      }
      if (rooms.findBySocket(socket.id)) {
        sendRoomError(socket, { code: "ALREADY_IN_ROOM", message: "Игрок уже находится в комнате" }, ack);
        return;
      }
      try {
        const managed = rooms.createRoom(socket.id, parsed.data.displayName, now, {
          roomName: parsed.data.roomName,
          visibility: parsed.data.visibility,
          maxPlayers: parsed.data.maxPlayers,
          ...(parsed.data.password === undefined ? {} : { password: parsed.data.password }),
        });
        await bindSocket(socket, managed);
        const joined = makeJoined(managed, false, now);
        socket.emit("room:joined", joined);
        ack?.(joined);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        broadcastRooms(now);
      } catch (caught) {
        sendRoomError(socket, toRoomError(caught), ack);
      }
    });

    socket.on("room:join", async (raw, ack) => {
      const now = nowProvider();
      if (!limiter.allow(`${socket.id}:room`, 8, 5_000, now)) {
        sendRoomError(socket, { code: "RATE_LIMITED", message: "Слишком много запросов" }, ack);
        return;
      }
      const parsed = roomJoinSchema.safeParse(raw);
      if (!parsed.success) {
        sendRoomError(socket, invalidRequest(), ack);
        return;
      }
      if (rooms.findBySocket(socket.id)) {
        sendRoomError(socket, { code: "ALREADY_IN_ROOM", message: "Игрок уже находится в комнате" }, ack);
        return;
      }
      try {
        const managed = rooms.joinRoom(parsed.data.code, socket.id, parsed.data.displayName, now, parsed.data.password);
        await bindSocket(socket, managed);
        const joined = makeJoined(managed, false, now);
        socket.emit("room:joined", joined);
        ack?.(joined);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        broadcastRooms(now);
      } catch (caught) {
        sendRoomError(socket, toRoomError(caught), ack);
      }
    });

    socket.on("room:resume", async (raw, ack) => {
      const now = nowProvider();
      const parsed = roomResumeSchema.safeParse(raw);
      if (!parsed.success) {
        sendRoomError(socket, invalidRequest(), ack);
        return;
      }
      if (rooms.findBySocket(socket.id)) {
        sendRoomError(socket, { code: "ALREADY_IN_ROOM", message: "Игрок уже находится в комнате" }, ack);
        return;
      }
      try {
        const room = rooms.getRoom(parsed.data.code);
        const oldSocketId = room?.players.find((player) => player.reconnectToken === parsed.data.reconnectToken)?.socketId;
        const managed = rooms.resumeRoom(parsed.data.code, parsed.data.reconnectToken, socket.id, now);
        if (oldSocketId && oldSocketId !== socket.id) {
          const oldSocket = io.sockets.sockets.get(oldSocketId);
          oldSocket?.disconnect(true);
        }
        await bindSocket(socket, managed);
        const joined = makeJoined(managed, true, now);
        socket.emit("room:joined", joined);
        ack?.(joined);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        io.to(managed.room.code).emit(
          "connection:status",
          managed.room.connectionStatusFor(managed.room.findPlayerById(managed.playerId)!),
        );
        flushRoom(managed.room, now, true);
      } catch (caught) {
        sendRoomError(socket, toRoomError(caught), ack);
      }
    });

    socket.on("room:leave", () => {
      const now = nowProvider();
      const left = rooms.leave(socket.id, now);
      if (!left) {
        socket.emit("room:error", { code: "PLAYER_NOT_IN_ROOM", message: "Игрок не находится в комнате" });
        return;
      }
      const roomCode = left.room.code;
      void socket.leave(roomCode);
      delete socket.data.roomCode;
      delete socket.data.playerId;
      delete socket.data.reconnectToken;
      limiter.clear(`${socket.id}:command`);
      io.to(roomCode).emit("connection:status", left.status);
      io.to(roomCode).emit("lobby:state", left.room.getLobbyState(now));
      flushRoom(left.room, now, true);
      broadcastRooms(now);
    });

    socket.on("lobby:update", (raw) => {
      const managed = rooms.findBySocket(socket.id);
      if (!managed) {
        socket.emit("room:error", { code: "PLAYER_NOT_IN_ROOM", message: "Сначала войдите в комнату" });
        return;
      }
      const parsed = lobbyUpdateSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("room:error", invalidRequest());
        return;
      }
      try {
        managed.room.updateCustomization(
          managed.playerId,
          parsed.data.customization as Partial<KingdomCustomization>,
          nowProvider(),
        );
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(nowProvider()));
      } catch (caught) {
        socket.emit("room:error", toRoomError(caught));
      }
    });

    socket.on("lobby:ready", (raw) => {
      const managed = rooms.findBySocket(socket.id);
      if (!managed) {
        socket.emit("room:error", { code: "PLAYER_NOT_IN_ROOM", message: "Сначала войдите в комнату" });
        return;
      }
      const parsed = lobbyReadySchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("room:error", invalidRequest());
        return;
      }
      const now = nowProvider();
      try {
        const started = managed.room.setReady(managed.playerId, parsed.data.ready, now);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        flushRoom(managed.room, now, started);
        broadcastRooms(now);
      } catch (caught) {
        socket.emit("room:error", toRoomError(caught));
      }
    });

    socket.on("lobby:start", () => {
      const managed = rooms.findBySocket(socket.id);
      if (!managed) {
        socket.emit("room:error", { code: "PLAYER_NOT_IN_ROOM", message: "Сначала войдите в комнату" });
        return;
      }
      const now = nowProvider();
      try {
        managed.room.startByHost(managed.playerId, now);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        flushRoom(managed.room, now, true);
        broadcastRooms(now);
      } catch (caught) {
        socket.emit("room:error", toRoomError(caught));
      }
    });

    socket.on("lobby:kick", (raw) => {
      const managed = rooms.findBySocket(socket.id);
      const parsed = lobbyPlayerActionSchema.safeParse(raw);
      if (!managed || !parsed.success) {
        socket.emit("room:error", managed ? invalidRequest() : { code: "PLAYER_NOT_IN_ROOM", message: "Сначала войдите в комнату" });
        return;
      }
      const now = nowProvider();
      try {
        const removed = managed.room.kickPlayer(managed.playerId, parsed.data.playerId, now);
        const removedSocket = removed.socketId ? io.sockets.sockets.get(removed.socketId) : undefined;
        if (removedSocket) {
          removedSocket.emit("room:error", { code: "KICKED", message: "Владелец удалил вас из комнаты" });
          void removedSocket.leave(managed.room.code);
          delete removedSocket.data.roomCode;
          delete removedSocket.data.playerId;
          delete removedSocket.data.reconnectToken;
        }
        removed.socketId = null;
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        broadcastRooms(now);
      } catch (caught) {
        socket.emit("room:error", toRoomError(caught));
      }
    });

    socket.on("lobby:transfer-owner", (raw) => {
      const managed = rooms.findBySocket(socket.id);
      const parsed = lobbyPlayerActionSchema.safeParse(raw);
      if (!managed || !parsed.success) {
        socket.emit("room:error", managed ? invalidRequest() : { code: "PLAYER_NOT_IN_ROOM", message: "Сначала войдите в комнату" });
        return;
      }
      const now = nowProvider();
      try {
        managed.room.transferOwner(managed.playerId, parsed.data.playerId, now);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        broadcastRooms(now);
      } catch (caught) {
        socket.emit("room:error", toRoomError(caught));
      }
    });

    socket.on("lobby:room-settings", (raw) => {
      const managed = rooms.findBySocket(socket.id);
      const parsed = lobbyRoomSettingsSchema.safeParse(raw);
      if (!managed || !parsed.success) {
        socket.emit("room:error", managed ? invalidRequest() : { code: "PLAYER_NOT_IN_ROOM", message: "Сначала войдите в комнату" });
        return;
      }
      const now = nowProvider();
      try {
        managed.room.updateRoomSettings(managed.playerId, {
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.visibility === undefined ? {} : { visibility: parsed.data.visibility }),
          ...(parsed.data.password === undefined ? {} : { passwordHash: hashPassword(parsed.data.password) }),
        }, now);
        io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
        broadcastRooms(now);
      } catch (caught) {
        socket.emit("room:error", toRoomError(caught));
      }
    });

    socket.on("game:command", (raw) => {
      const now = nowProvider();
      const parsed = gameCommandSchema.safeParse(raw);
      if (!parsed.success) {
        const candidate = raw as { id?: unknown; seq?: unknown };
        const result: GameCommandResult = {
          id: typeof candidate?.id === "string" ? candidate.id.slice(0, 80) : "invalid",
          seq: typeof candidate?.seq === "number" ? candidate.seq : 0,
          ok: false,
          serverTime: now,
          error: { code: "INVALID_COMMAND", message: "Команда не прошла строгую проверку" },
        };
        socket.emit("game:command-result", result);
        return;
      }
      const managed = rooms.findBySocket(socket.id);
      if (!managed) {
        socket.emit("game:command-result", {
          id: parsed.data.id,
          seq: parsed.data.seq,
          ok: false,
          serverTime: now,
          error: { code: "NOT_IN_MATCH", message: "Игрок не находится в комнате" },
        });
        return;
      }
      if (!limiter.allow(`${socket.id}:command`, MATCH_CONFIG.commandRateLimit, MATCH_CONFIG.commandRateWindowMs, now)) {
        const expectedSeq = managed.room.findPlayerById(managed.playerId)?.lastCommandSeq ?? 0;
        socket.emit("game:command-result", {
          id: parsed.data.id,
          seq: parsed.data.seq,
          ok: false,
          serverTime: now,
          error: {
            code: "RATE_LIMITED",
            message: "Слишком много игровых команд",
            details: { expectedSeq: expectedSeq + 1 },
          },
        });
        return;
      }
      const result = managed.room.handleCommand(managed.playerId, parsed.data as GameCommand, now);
      socket.emit("game:command-result", result);
      flushRoom(managed.room, now, result.ok);
    });

    socket.on("game:rematch", (raw) => {
      const parsed = rematchSchema.safeParse(raw);
      const managed = rooms.findBySocket(socket.id);
      if (!parsed.success || !managed) return;
      const now = nowProvider();
      const started = managed.room.requestRematch(managed.playerId, parsed.data.want, now);
      if (started) {
        for (const player of managed.room.players) {
          if (player.socketId) limiter.clear(`${player.socketId}:command`);
        }
      }
      flushRoom(managed.room, now, true);
      if (started) io.to(managed.room.code).emit("lobby:state", managed.room.getLobbyState(now));
    });

    socket.on("ping:request", (raw) => {
      const parsed = pingSchema.safeParse(raw);
      if (parsed.success) socket.emit("ping:response", { clientTime: parsed.data.clientTime, serverTime: nowProvider() });
    });

    socket.on("disconnect", () => {
      const now = nowProvider();
      const disconnected = rooms.disconnect(socket.id, now);
      limiter.clear(`${socket.id}:room`);
      limiter.clear(`${socket.id}:command`);
      if (!disconnected) return;
      io.to(disconnected.room.code).emit("connection:status", disconnected.status);
      io.to(disconnected.room.code).emit("lobby:state", disconnected.room.getLobbyState(now));
      flushRoom(disconnected.room, now, true);
      broadcastRooms(now);
    });
  });

  const interval = setInterval(() => {
    const now = nowProvider();
    const roomCountBeforeTick = rooms.size;
    rooms.tick(now);
    if (rooms.size !== roomCountBeforeTick) broadcastRooms(now);
    const includeSnapshots = now - lastSnapshotAt >= MATCH_CONFIG.snapshotMs;
    if (includeSnapshots) lastSnapshotAt = now;
    for (const room of rooms.allRooms()) flushRoom(room, now, includeSnapshots);
  }, MATCH_CONFIG.tickMs);
  interval.unref();

  return { close: () => clearInterval(interval) };
};
