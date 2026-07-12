import { BUILDING_CONFIG, MATCH_CONFIG, UNIT_CONFIG } from "@ashes/shared";
import { describe, expect, it } from "vitest";
import { advance, createStartedRoom, fund, issue } from "./helpers.js";

describe("squads, movement, combat and victory", () => {
  it("supports mixed squads but never a fifth active squad", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    firstState.garrison = { infantry: 12, archer: 8, cavalry: 4, catapult: 4 };
    for (let index = 0; index < 4; index += 1) {
      const mixed = index === 0;
      const result = issue(
        room,
        first.playerId,
        "squad:create",
        {
          name: `Отряд ${index + 1}`,
          composition: mixed
            ? { infantry: 2, archer: 2, cavalry: 1, catapult: 1 }
            : { infantry: 1, archer: 0, cavalry: 0, catapult: 0 },
          formation: mixed ? "protectSiege" : "line",
          behavior: "aggressive",
        },
        clock.now,
      );
      expect(result.ok).toBe(true);
    }
    expect(firstState.squads).toHaveLength(4);
    expect(firstState.squads[0]!.composition).toEqual({ infantry: 2, archer: 2, cavalry: 1, catapult: 1 });
    const fifth = issue(
      room,
      first.playerId,
      "squad:create",
      {
        name: "Пятый",
        composition: { infantry: 1, archer: 0, cavalry: 0, catapult: 0 },
        formation: "line",
        behavior: "aggressive",
      },
      clock.now,
    );
    expect(fifth.error?.code).toBe("SQUAD_LIMIT");
  });

  it("moves only from server ticks and destroys the enemy town hall for victory", () => {
    const { room, clock, first, second, match, firstState, secondState } = createStartedRoom();
    firstState.garrison.catapult = 12;
    expect(
      issue(
        room,
        first.playerId,
        "squad:create",
        {
          name: "Гром",
          composition: { infantry: 0, archer: 0, cavalry: 0, catapult: 12 },
          formation: "protectSiege",
          behavior: "buildingsOnly",
        },
        clock.now,
      ).ok,
    ).toBe(true);
    clock.now = match.truceEndsAt;
    room.tick(clock.now);
    const squad = firstState.squads[0]!;
    const startX = squad.position.x;
    expect(
      issue(
        room,
        first.playerId,
        "squad:move",
        { squadId: squad.id, destination: { x: 500, y: 500 } },
        clock.now,
      ).ok,
    ).toBe(true);
    advance(room, clock, 1_000);
    expect(squad.position.x).toBeGreaterThan(startX);
    expect(squad.position.x).toBeLessThanOrEqual(startX + UNIT_CONFIG.catapult.speed + 1);

    const enemyTownHall = secondState.buildings.find((building) => building.type === "townHall")!;
    enemyTownHall.hp = 200;
    squad.position = { x: enemyTownHall.position.x - 80, y: enemyTownHall.position.y };
    squad.route = [];
    squad.target = null;
    expect(
      issue(
        room,
        first.playerId,
        "squad:target",
        { squadId: squad.id, target: { kind: "enemyBase" } },
        clock.now,
      ).ok,
    ).toBe(true);
    advance(room, clock, 100);
    expect(enemyTownHall.status).toBe("destroyed");
    expect(match.phase).toBe("finished");
    expect(match.winnerId).toBe(first.playerId);
    expect(match.finishReason).toBe("townHallDestroyed");
    expect(second.playerId).not.toBe(match.winnerId);
  });

  it("heals a wounded surviving squad in a completed hospital", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    fund(firstState);
    const townHall = firstState.buildings.find((building) => building.type === "townHall")!;
    for (let targetLevel = 2; targetLevel <= 3; targetLevel += 1) {
      expect(issue(room, first.playerId, "building:upgrade", { buildingId: townHall.id }, clock.now).ok).toBe(true);
      advance(room, clock, BUILDING_CONFIG.townHall.levels[targetLevel - 1]!.timeMs);
    }
    expect(issue(room, first.playerId, "building:construct", { buildingType: "hospital" }, clock.now).ok).toBe(true);
    advance(room, clock, BUILDING_CONFIG.hospital.levels[0]!.timeMs + 50);
    firstState.garrison.infantry = 4;
    expect(
      issue(
        room,
        first.playerId,
        "squad:create",
        {
          name: "Раненые",
          composition: { infantry: 4, archer: 0, cavalry: 0, catapult: 0 },
          formation: "defensive",
          behavior: "defensive",
        },
        clock.now,
      ).ok,
    ).toBe(true);
    const squad = firstState.squads[0]!;
    squad.unitHealth.infantry -= 180;
    squad.hp -= 180;
    const woundedHp = squad.hp;
    expect(issue(room, first.playerId, "squad:hospitalize", { squadId: squad.id }, clock.now).ok).toBe(true);
    expect(squad.status).toBe("healing");
    advance(room, clock, 60_000);
    expect(squad.hp).toBeGreaterThan(woundedHp);
    expect(squad.status).toBe("idle");
  });
});
