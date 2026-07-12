import { MATCH_CONFIG } from "@ashes/shared";
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
    expect(() => manager.joinRoom(host.room.code, "c", "Celine", now)).toThrow(/два игрока/i);
  });

  it("starts only after both ready and enforces the configurable 20 second truce", () => {
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
});
