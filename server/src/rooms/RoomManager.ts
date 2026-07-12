import { MATCH_CONFIG, type ConnectionStatusEvent } from "@ashes/shared";
import { GameRoom } from "../game/GameRoom.js";
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

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly nowProvider: () => number;

  public constructor(nowProvider: () => number = Date.now) {
    this.nowProvider = nowProvider;
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

  public createRoom(socketId: string, displayName: string, now = this.nowProvider()): ManagedPlayer {
    const code = this.generateCode();
    const room = new GameRoom(code, this.nowProvider);
    this.rooms.set(code, room);
    const added = room.addPlayer(socketId, displayName, now);
    return { room, playerId: added.player.playerId, reconnectToken: added.reconnectToken };
  }

  public joinRoom(code: string, socketId: string, displayName: string, now = this.nowProvider()): ManagedPlayer {
    const room = this.getRoom(code);
    if (!room) throw new RoomActionError("ROOM_NOT_FOUND", "Комната с таким кодом не найдена");
    const added = room.addPlayer(socketId, displayName, now);
    return { room, playerId: added.player.playerId, reconnectToken: added.reconnectToken };
  }

  public resumeRoom(code: string, token: string, socketId: string, now = this.nowProvider()): ManagedPlayer {
    const room = this.getRoom(code);
    if (!room) throw new RoomActionError("ROOM_NOT_FOUND", "Комната с таким кодом не найдена");
    const player = room.resumePlayer(token, socketId, now);
    return { room, playerId: player.playerId, reconnectToken: player.reconnectToken };
  }

  public findBySocket(socketId: string): ManagedPlayer | undefined {
    for (const room of this.rooms.values()) {
      const player = room.findPlayerBySocket(socketId);
      if (player) return { room, playerId: player.playerId, reconnectToken: player.reconnectToken };
    }
    return undefined;
  }

  public disconnect(socketId: string, now = this.nowProvider()): DisconnectResult | null {
    const managed = this.findBySocket(socketId);
    if (!managed) return null;
    const status = managed.room.disconnectSocket(socketId, now);
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
    return { room: managed.room, status };
  }

  public tick(now = this.nowProvider()): void {
    for (const [code, room] of this.rooms) {
      room.tick(now);
      if (room.players.length === 0 || now - room.activityAt >= MATCH_CONFIG.roomIdleCleanupMs) this.rooms.delete(code);
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
