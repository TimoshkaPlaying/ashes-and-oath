import { MATCH_CONFIG } from "@ashes/shared";
import { describe, expect, it } from "vitest";
import { createStartedRoom, issue } from "./helpers.js";

describe("security, fog and reconnect", () => {
  it("deduplicates command IDs and enforces a strict sequence", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    const player = room.findPlayerById(first.playerId)!;
    const firstCommand = {
      id: "stable-command-id",
      seq: 1,
      type: "building:construct" as const,
      payload: { buildingType: "sawmill" as const },
    };
    const result = room.handleCommand(first.playerId, firstCommand, clock.now);
    const resourcesAfter = { ...firstState.resources };
    const replay = room.handleCommand(first.playerId, firstCommand, clock.now + 1);
    expect(replay).toEqual(result);
    expect(firstState.resources).toEqual(resourcesAfter);

    const skipped = room.handleCommand(
      first.playerId,
      { id: "skipped-command-id", seq: 3, type: "training:cancel", payload: { queueId: "missing" } },
      clock.now,
    );
    expect(skipped.error?.code).toBe("OUT_OF_SEQUENCE");
    expect(player.lastCommandSeq).toBe(1);
  });

  it("resumes within 60 seconds and awards victory after the deadline", () => {
    const firstRun = createStartedRoom();
    const token = firstRun.second.reconnectToken;
    const status = firstRun.room.disconnectSocket("socket-b", firstRun.clock.now);
    expect(status?.reconnectDeadline).toBe(firstRun.clock.now + MATCH_CONFIG.reconnectMs);
    firstRun.clock.now += MATCH_CONFIG.reconnectMs - 1;
    const resumed = firstRun.room.resumePlayer(token, "socket-b-new", firstRun.clock.now);
    expect(resumed.connected).toBe(true);
    expect(firstRun.room.getMatchState()?.phase).not.toBe("finished");

    const timedOut = createStartedRoom(100_000);
    timedOut.room.disconnectSocket("socket-b", timedOut.clock.now);
    timedOut.clock.now += MATCH_CONFIG.reconnectMs;
    timedOut.room.tick(timedOut.clock.now);
    expect(timedOut.match.phase).toBe("finished");
    expect(timedOut.match.winnerId).toBe(timedOut.first.playerId);
    expect(timedOut.match.finishReason).toBe("disconnectTimeout");
  });

  it("reveals the entire map only in Last Battle", () => {
    const { room, clock, first, match, secondState } = createStartedRoom();
    clock.now = match.truceEndsAt;
    room.tick(clock.now);
    const normal = room.createSnapshot(first.playerId, clock.now);
    expect(normal.opponent).not.toBeNull();
    expect(normal.visibleEnemyBuildings).toHaveLength(0);
    clock.now = match.lastBattleStartsAt;
    room.tick(clock.now);
    const final = room.createSnapshot(first.playerId, clock.now);
    expect(final.phase).toBe("lastBattle");
    expect(final.visibleEnemyBuildings.map((building) => building.id)).toContain(secondState.buildings[0]!.id);
  });

  it("starts a clean rematch only after both players vote", () => {
    const { room, clock, first, second, match } = createStartedRoom();
    const oldMatchId = match.matchId;
    room.finishMatch(first.playerId, "townHallDestroyed", clock.now);
    expect(room.requestRematch(first.playerId, true, clock.now)).toBe(false);
    expect(room.getMatchState()?.matchId).toBe(oldMatchId);
    clock.now += 100;
    expect(room.requestRematch(second.playerId, true, clock.now)).toBe(true);
    expect(room.getMatchState()?.matchId).not.toBe(oldMatchId);
    expect(room.getMatchState()?.phase).toBe("truce");
    expect(room.getMatchState()?.truceEndsAt).toBe(clock.now + MATCH_CONFIG.truceMs);
  });
});
