import type { GameCommandResult, GameEvent, GameSnapshot, RoomError, RoomJoined } from "@ashes/shared";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createGameServer, type GameServer } from "../src/server.js";

const once = <T>(socket: ClientSocket, event: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 3_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

const onceWhere = <T>(socket: ClientSocket, event: string, predicate: (payload: T) => boolean): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for matching ${event}`));
    }, 3_000);
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });

const connectSocket = async (port: number, sockets: ClientSocket[]): Promise<ClientSocket> => {
  const socket = createClient(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  await once(socket, "connect");
  return socket;
};

describe("Socket.IO gateway", () => {
  let server: GameServer | null = null;
  const sockets: ClientSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    if (server) await server.stop();
    server = null;
  });

  it("connects two browsers, rejects a third, starts a match and serves health", async () => {
    server = createGameServer({ clientOrigins: ["*"] });
    const port = await server.start(0, "127.0.0.1");
    const connect = async () => {
      const socket = createClient(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
      sockets.push(socket);
      await once(socket, "connect");
      return socket;
    };
    const first = await connect();
    const second = await connect();
    const third = await connect();

    const createdPromise = once<RoomJoined>(first, "room:joined");
    first.emit("room:create", { displayName: "Alice" });
    const created = await createdPromise;
    const joinedPromise = once<RoomJoined>(second, "room:joined");
    second.emit("room:join", { code: created.code, displayName: "Boris" });
    await joinedPromise;

    const rejectedPromise = once<RoomError>(third, "room:error");
    third.emit("room:join", { code: created.code, displayName: "Celine" });
    expect((await rejectedPromise).code).toBe("ROOM_FULL");

    first.emit("lobby:ready", { ready: true });
    const snapshotPromise = once<{ phase: string; opponent: unknown }>(first, "game:snapshot");
    second.emit("lobby:ready", { ready: true });
    const snapshot = await snapshotPromise;
    expect(snapshot.phase).toBe("truce");
    expect(snapshot.opponent).toBeNull();

    const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json()) as {
      status: string;
      players: number;
    };
    expect(health.status).toBe("ok");
    expect(health.players).toBe(2);
  });

  it("resumes a disconnected player on a fresh socket and rejects duplicate room bindings", async () => {
    server = createGameServer({ clientOrigins: ["*"] });
    const port = await server.start(0, "127.0.0.1");
    const first = await connectSocket(port, sockets);
    const second = await connectSocket(port, sockets);

    const createdPromise = once<RoomJoined>(first, "room:joined");
    first.emit("room:create", { displayName: "Alice" });
    const created = await createdPromise;
    const joinedPromise = once<RoomJoined>(second, "room:joined");
    second.emit("room:join", { code: created.code, displayName: "Boris" });
    const joined = await joinedPromise;
    first.emit("lobby:ready", { ready: true });
    const startedPromise = once<GameSnapshot>(first, "game:snapshot");
    second.emit("lobby:ready", { ready: true });
    await startedPromise;

    const disconnectedPromise = onceWhere<{ playerId: string; connected: boolean }>(
      first,
      "connection:status",
      (status) => status.playerId === joined.playerId && !status.connected,
    );
    second.disconnect();
    await disconnectedPromise;

    const replacement = await connectSocket(port, sockets);
    const resumedPromise = once<RoomJoined>(replacement, "room:joined");
    const resumedSnapshotPromise = once<GameSnapshot>(replacement, "game:snapshot");
    replacement.emit("room:resume", { code: joined.code, reconnectToken: joined.reconnectToken });
    const resumed = await resumedPromise;
    const snapshot = await resumedSnapshotPromise;
    expect(resumed.resumed).toBe(true);
    expect(resumed.playerId).toBe(joined.playerId);
    expect(snapshot.playerId).toBe(joined.playerId);

    const duplicateErrorPromise = once<RoomError>(replacement, "room:error");
    replacement.emit("room:resume", { code: joined.code, reconnectToken: joined.reconnectToken });
    expect((await duplicateErrorPromise).code).toBe("INVALID_REQUEST");
    expect(server.rooms.playerCount).toBe(2);
  });

  it("filters truce events per recipient and releases a socket through room:leave", async () => {
    server = createGameServer({ clientOrigins: ["*"] });
    const port = await server.start(0, "127.0.0.1");
    const first = await connectSocket(port, sockets);
    const second = await connectSocket(port, sockets);
    const outsider = await connectSocket(port, sockets);

    const createdPromise = once<RoomJoined>(first, "room:joined");
    first.emit("room:create", { displayName: "Alice" });
    const created = await createdPromise;
    const joinedPromise = once<RoomJoined>(second, "room:joined");
    second.emit("room:join", { code: created.code, displayName: "Boris" });
    const joined = await joinedPromise;
    first.emit("lobby:ready", { ready: true });
    const startedPromise = once<GameSnapshot>(first, "game:snapshot");
    second.emit("lobby:ready", { ready: true });
    await startedPromise;

    const room = server.rooms.getRoom(created.code)!;
    room.getMatchState()!.players.get(created.playerId)!.garrison.infantry = 4;
    const firstEvents: GameEvent[] = [];
    const secondEvents: GameEvent[] = [];
    first.on("game:event", (event: GameEvent) => firstEvents.push(event));
    second.on("game:event", (event: GameEvent) => secondEvents.push(event));
    const commandResultPromise = once<GameCommandResult>(first, "game:command-result");
    first.emit("game:command", {
      id: "event_filter_command",
      seq: 1,
      type: "squad:create",
      payload: {
        name: "Hidden preparation",
        composition: { infantry: 4, archer: 0, cavalry: 0, catapult: 0 },
        formation: "line",
        behavior: "aggressive",
      },
    });
    expect((await commandResultPromise).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(firstEvents.some((event) => event.type === "squadCreated")).toBe(true);
    expect(secondEvents.some((event) => event.type === "squadCreated")).toBe(false);

    const duplicateErrorPromise = once<RoomError>(first, "room:error");
    first.emit("room:join", { code: created.code, displayName: "Alice again" });
    expect((await duplicateErrorPromise).code).toBe("INVALID_REQUEST");

    const finishedSnapshotPromise = onceWhere<GameSnapshot>(
      second,
      "game:snapshot",
      (snapshot) => snapshot.phase === "finished",
    );
    first.emit("room:leave");
    const finished = await finishedSnapshotPromise;
    expect(finished.winnerId).toBe(joined.playerId);
    expect(finished.finishReason).toBe("opponentLeft");

    const staleResumeErrorPromise = once<RoomError>(outsider, "room:error");
    outsider.emit("room:resume", { code: created.code, reconnectToken: created.reconnectToken });
    expect((await staleResumeErrorPromise).code).toBe("INVALID_RECONNECT_TOKEN");

    const newRoomPromise = once<RoomJoined>(first, "room:joined");
    first.emit("room:create", { displayName: "Alice new" });
    expect((await newRoomPromise).code).not.toBe(created.code);
  });

  it("returns the authoritative sequence after rate limiting and clears it for a rematch", async () => {
    server = createGameServer({ clientOrigins: ["*"] });
    const port = await server.start(0, "127.0.0.1");
    const first = await connectSocket(port, sockets);
    const second = await connectSocket(port, sockets);

    const createdPromise = once<RoomJoined>(first, "room:joined");
    first.emit("room:create", { displayName: "Alice" });
    const created = await createdPromise;
    const joinedPromise = once<RoomJoined>(second, "room:joined");
    second.emit("room:join", { code: created.code, displayName: "Boris" });
    const joined = await joinedPromise;
    first.emit("lobby:ready", { ready: true });
    const startedPromise = once<GameSnapshot>(first, "game:snapshot");
    second.emit("lobby:ready", { ready: true });
    await startedPromise;

    for (let seq = 1; seq <= 30; seq += 1) {
      const resultPromise = once<GameCommandResult>(first, "game:command-result");
      first.emit("game:command", {
        id: `rate_command_${seq}`,
        seq,
        type: "training:cancel",
        payload: { queueId: "missing_queue" },
      });
      const result = await resultPromise;
      expect(result.error?.code).toBe("NOT_FOUND");
    }
    const limitedPromise = once<GameCommandResult>(first, "game:command-result");
    first.emit("game:command", {
      id: "rate_command_31",
      seq: 31,
      type: "training:cancel",
      payload: { queueId: "missing_queue" },
    });
    const limited = await limitedPromise;
    expect(limited.error?.code).toBe("RATE_LIMITED");
    expect(limited.error?.details?.expectedSeq).toBe(31);

    const room = server.rooms.getRoom(created.code)!;
    room.finishMatch(created.playerId, "townHallDestroyed");
    const rematchSnapshotPromise = onceWhere<GameSnapshot>(
      first,
      "game:snapshot",
      (snapshot) => snapshot.phase === "truce" && snapshot.matchId !== "",
    );
    first.emit("game:rematch", { want: true });
    second.emit("game:rematch", { want: true });
    const rematch = await rematchSnapshotPromise;
    expect(rematch.self.nextCommandSeq).toBe(1);

    const firstRematchCommandPromise = once<GameCommandResult>(first, "game:command-result");
    first.emit("game:command", {
      id: "rematch_command_1",
      seq: 1,
      type: "training:cancel",
      payload: { queueId: "missing_queue" },
    });
    expect((await firstRematchCommandPromise).error?.code).toBe("NOT_FOUND");
    expect(joined.playerId).not.toBe(created.playerId);
  });
});
