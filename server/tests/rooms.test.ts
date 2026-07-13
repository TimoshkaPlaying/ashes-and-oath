import { MATCH_CONFIG } from "@ashes/shared";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { createStartedRoom, issue } from "./helpers.js";

describe("rooms, lobby and truce", () => {
  it("creates a short-code room, admits a second player and rejects a third", () => {
    let now = 1_000;
    const manager = new RoomManager(() => now);
    const host = manager.createRoom("a", "Alice", now);
    expect(host.room.code).toMatch(/^[A-Z2-9]{5}$/);
    const guest = manager.joinRoom(host.room.code.toLowerCase(), "b", "Boris", now);
    expect(guest.room).toBe(host.room);
    expect(host.room.players).toHaveLength(2);
    expect(() => manager.joinRoom(host.room.code, "c", "Celine", now)).toThrow(/заполнена/i);
  });

  it("starts only after both ready and enforces the authoritative 30 minute truce", () => {
    const { room, clock, first, second, match, firstState } = createStartedRoom();
    expect(room.status).toBe("playing");
    expect(match.phase).toBe("truce");
    expect(match.truceEndsAt - match.startedAt).toBe(MATCH_CONFIG.truceMs);

    firstState.garrison.infantry = 4;
    expect(
      issue(
        room,
        first.playerId,
        "squad:create",
        {
          name: "Стража",
          composition: { infantry: 4, archer: 0, cavalry: 0, catapult: 0 },
          formation: "defensive",
          behavior: "aggressive",
        },
        clock.now,
      ).ok,
    ).toBe(true);
    const squad = firstState.squads[0]!;
    const blocked = issue(
      room,
      first.playerId,
      "squad:target",
      { squadId: squad.id, target: { kind: "enemyBase" } },
      clock.now,
    );
    expect(blocked.error?.code).toBe("TRUCE_ACTIVE");

    clock.now = match.truceEndsAt - 1;
    room.tick(clock.now);
    expect(match.phase).toBe("truce");
    clock.now += 1;
    room.tick(clock.now);
    expect(match.phase).toBe("battle");

    const allowed = issue(
      room,
      first.playerId,
      "squad:target",
      { squadId: squad.id, target: { kind: "enemyBase" } },
      clock.now,
    );
    expect(allowed.ok).toBe(true);
    expect(second.playerId).not.toBe(first.playerId);
  });

  it("hides the complete opponent during the truce", () => {
    const { room, clock, first } = createStartedRoom();
    const snapshot = room.createSnapshot(first.playerId, clock.now);
    expect(snapshot.phase).toBe("truce");
    expect(snapshot.opponent).toBeNull();
    expect(snapshot.arena.enemyBase).toBeNull();
    expect(snapshot.visibleEnemyBuildings).toEqual([]);
    expect(snapshot.visibleEnemySquads).toEqual([]);
  });

  it("lists only public rooms and enforces room passwords", () => {
    const now = 5_000;
    const manager = new RoomManager(() => now);
    const publicRoom = manager.createRoom("public-host", "Alice", now, {
      roomName: "Открытая долина",
      visibility: "public",
      maxPlayers: 2,
      password: "oath123",
    });
    manager.createRoom("private-host", "Boris", now, {
      roomName: "Тайный совет",
      visibility: "private",
      maxPlayers: 2,
    });

    expect(manager.publicRooms(now)).toMatchObject([{ code: publicRoom.room.code, name: "Открытая долина", passwordRequired: true, joinable: true }]);
    expect(() => manager.joinRoom(publicRoom.room.code, "guest-a", "Celine", now)).toThrow(/пароль/i);
    expect(() => manager.joinRoom(publicRoom.room.code, "guest-b", "Celine", now, "wrong")).toThrow(/неверный/i);
    manager.joinRoom(publicRoom.room.code, "guest-c", "Celine", now, "oath123");
    expect(manager.publicRooms(now)[0]).toMatchObject({ status: "full", joinable: false, playerCount: 2 });
  });

  it("lets only the owner transfer rights, kick a guest and start a ready match", () => {
    const now = 7_000;
    const manager = new RoomManager(() => now);
    const host = manager.createRoom("owner", "Alice", now, {
      roomName: "Королевский совет",
      visibility: "public",
      maxPlayers: 2,
    });
    const guest = manager.joinRoom(host.room.code, "guest", "Boris", now);
    expect(() => host.room.transferOwner(guest.playerId, guest.playerId, now)).toThrow(/владельцу/i);
    host.room.transferOwner(host.playerId, guest.playerId, now);
    expect(host.room.getLobbyState(now).ownerPlayerId).toBe(guest.playerId);
    const removed = host.room.kickPlayer(guest.playerId, host.playerId, now);
    expect(removed.playerId).toBe(host.playerId);
    expect(host.room.players).toHaveLength(1);
  });

  it("atomically restores rooms, reconnect tokens and an active match after a server restart", () => {
    let now = 20_000;
    const directory = mkdtempSync(join(tmpdir(), "ashes-rooms-"));
    const stateFile = join(directory, "rooms.json");
    try {
      const firstManager = new RoomManager(() => now, stateFile);
      const host = firstManager.createRoom("host-socket", "Alice", now, {
        roomName: "Persistent oath",
        visibility: "public",
        maxPlayers: 2,
      });
      const guest = firstManager.joinRoom(host.room.code, "guest-socket", "Boris", now);
      host.room.setReady(host.playerId, true, now);
      host.room.setReady(guest.playerId, true, now);
      host.room.startByHost(host.playerId, now);
      const truceEndsAt = host.room.getMatchState()!.truceEndsAt;
      firstManager.persist(now);

      now += 5_000;
      const restoredManager = new RoomManager(() => now, stateFile);
      const restored = restoredManager.getRoom(host.room.code)!;
      expect(restored.status).toBe("playing");
      expect(restored.getMatchState()?.truceEndsAt).toBe(truceEndsAt);
      expect(restored.players).toHaveLength(2);

      const resumed = restoredManager.resumeRoom(host.room.code, host.reconnectToken, "host-new", now);
      expect(resumed.playerId).toBe(host.playerId);
      expect(restored.createSnapshot(host.playerId, now).roomCode).toBe(host.room.code);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
