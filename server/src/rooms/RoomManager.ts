import {
  MATCH_CONFIG,
  type ConnectionStatusEvent,
  type PublicRoomStatus,
  type PublicRoomSummary,
  type RoomCreateRequest,
} from "@ashes/shared";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GameRoom, type PersistedGameRoom } from "../game/GameRoom.js";
import { RoomActionError } from "./errors.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface ManagedPlayer {
  room: GameRoom;
  playerId: string;
  reconnectToken: string;
}

export interface DisconnectResult {
  room: GameRoom;
  status: ConnectionStatusEvent;
}

export const hashPassword = (password: string | undefined): string | null => {
  const normalized = password?.trim();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
};

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly nowProvider: () => number;
  private readonly persistencePath: string | null;
  private lastPersisted = "";
  private lastPersistedAt = 0;

  public constructor(nowProvider: () => number = Date.now, persistencePath: string | null = null) {
    this.nowProvider = nowProvider;
    this.persistencePath = persistencePath;
    this.restorePersistedRooms();
  }

  public get size(): number {
    return this.rooms.size;
  }

  public get playerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.players.length;
    return total;
  }

  public allRooms(): readonly GameRoom[] {
    return [...this.rooms.values()];
  }

  public getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  public createRoom(
    socketId: string,
    displayName: string,
    now = this.nowProvider(),
    options?: Omit<RoomCreateRequest, "displayName">,
  ): ManagedPlayer {
    const code = this.generateCode();
    const room = new GameRoom(code, this.nowProvider, {
      name: options?.roomName ?? `Комната ${displayName}`,
      visibility: options?.visibility ?? "private",
      maxPlayers: options?.maxPlayers ?? 2,
      passwordHash: hashPassword(options?.password),
      createdAt: now,
    });
    this.rooms.set(code, room);
    const added = room.addPlayer(socketId, displayName, now);
    this.persist();
    return { room, playerId: added.player.playerId, reconnectToken: added.reconnectToken };
  }

  public joinRoom(
    code: string,
    socketId: string,
    displayName: string,
    now = this.nowProvider(),
    password?: string,
  ): ManagedPlayer {
    const room = this.getRoom(code);
    if (!room) throw new RoomActionError("ROOM_NOT_FOUND", "Комната с таким кодом не найдена");
    if (room.passwordRequired && !password?.trim()) {
      throw new RoomActionError("ROOM_PASSWORD_REQUIRED", "Для входа нужен пароль комнаты");
    }
    if (!room.matchesPasswordHash(hashPassword(password))) {
      throw new RoomActionError("ROOM_PASSWORD_INVALID", "Неверный пароль комнаты");
    }
    const added = room.addPlayer(socketId, displayName, now);
    this.persist();
    return { room, playerId: added.player.playerId, reconnectToken: added.reconnectToken };
  }

  public resumeRoom(code: string, token: string, socketId: string, now = this.nowProvider()): ManagedPlayer {
    const room = this.getRoom(code);
    if (!room) throw new RoomActionError("ROOM_NOT_FOUND", "Комната с таким кодом не найдена");
    const player = room.resumePlayer(token, socketId, now);
    this.persist();
    return { room, playerId: player.playerId, reconnectToken: player.reconnectToken };
  }

  public findBySocket(socketId: string): ManagedPlayer | undefined {
    for (const room of this.rooms.values()) {
      const player = room.findPlayerBySocket(socketId);
      if (player) return { room, playerId: player.playerId, reconnectToken: player.reconnectToken };
    }
    return undefined;
  }

  public publicRooms(now = this.nowProvider()): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.roomVisibility === "public")
      .map((room) => {
        const playerCount = room.players.length;
        const full = playerCount >= room.capacity;
        let status: PublicRoomStatus = "waiting";
        if (room.status === "playing") status = "playing";
        else if (room.status === "finished") status = "unavailable";
        else if (full) status = "full";
        else if (room.players.length > 1 && room.players.every((player) => player.ready && player.connected)) status = "starting";
        const owner = room.findPlayerById(room.ownerId);
        return {
          code: room.code,
          name: room.name,
          ownerName: owner?.displayName ?? "Неизвестный владелец",
          playerCount,
          maxPlayers: room.capacity,
          status,
          createdAt: room.createdTimestamp,
          joinable: room.status === "lobby" && !full,
          passwordRequired: room.passwordRequired,
        };
      })
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((room) => ({ ...room, createdAt: Math.min(room.createdAt, now) }));
  }

  public disconnect(socketId: string, now = this.nowProvider()): DisconnectResult | null {
    const managed = this.findBySocket(socketId);
    if (!managed) return null;
    const status = managed.room.disconnectSocket(socketId, now);
    if (status) this.persist();
    return status ? { room: managed.room, status } : null;
  }

  public leave(socketId: string, now = this.nowProvider()): DisconnectResult | null {
    const managed = this.findBySocket(socketId);
    if (!managed) return null;
    const status = managed.room.leaveSocket(socketId, now);
    if (!status) return null;
    if (
      managed.room.players.length === 0 ||
      managed.room.players.every((player) => !player.connected && player.reconnectDeadline === null)
    ) {
      this.rooms.delete(managed.room.code);
    }
    this.persist();
    return { room: managed.room, status };
  }

  public tick(now = this.nowProvider()): void {
    for (const [code, room] of this.rooms) {
      room.tick(now);
      if (room.players.length === 0 || now - room.activityAt >= MATCH_CONFIG.roomIdleCleanupMs) this.rooms.delete(code);
    }
    if (now - this.lastPersistedAt >= 1_000) this.persist(now);
  }

  public persist(now = this.nowProvider()): void {
    if (!this.persistencePath) return;
    const rooms = [...this.rooms.values()].map((room) => room.serialize());
    const fingerprint = JSON.stringify({ version: 1, rooms });
    this.lastPersistedAt = now;
    if (fingerprint === this.lastPersisted) return;
    const serialized = JSON.stringify({
      version: 1,
      savedAt: now,
      rooms,
    });
    const directory = dirname(this.persistencePath);
    const temporaryPath = `${this.persistencePath}.tmp`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporaryPath, serialized, "utf8");
    renameSync(temporaryPath, this.persistencePath);
    this.lastPersisted = fingerprint;
  }

  private restorePersistedRooms(): void {
    if (!this.persistencePath || !existsSync(this.persistencePath)) return;
    try {
      const document = JSON.parse(readFileSync(this.persistencePath, "utf8")) as {
        version?: number;
        rooms?: PersistedGameRoom[];
      };
      if (document.version !== 1 || !Array.isArray(document.rooms)) return;
      for (const persisted of document.rooms) {
        if (!persisted || typeof persisted.code !== "string") continue;
        const room = GameRoom.restore(persisted, this.nowProvider);
        this.rooms.set(room.code, room);
      }
      this.lastPersisted = JSON.stringify({ version: 1, rooms: [...this.rooms.values()].map((room) => room.serialize()) });
    } catch (error) {
      console.error("[rooms] Не удалось восстановить сохранённое состояние", error);
    }
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let index = 0; index < 5; index += 1) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomActionError("INTERNAL_ERROR", "Не удалось создать уникальный код комнаты");
  }
}
