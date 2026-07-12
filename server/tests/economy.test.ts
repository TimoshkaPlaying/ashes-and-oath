import { BUILDING_CONFIG, MATCH_CONFIG, UNIT_CONFIG } from "@ashes/shared";
import { describe, expect, it } from "vitest";
import { advance, createStartedRoom, fund, issue } from "./helpers.js";

describe("authoritative economy, progression and training", () => {
  it("produces resources only through completed buildings and stops at storage capacity", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    const initialWood = firstState.resources.wood;
    advance(room, clock, 1_000);
    expect(firstState.resources.wood).toBe(initialWood);

    const result = issue(room, first.playerId, "building:construct", { buildingType: "sawmill" }, clock.now);
    expect(result.ok).toBe(true);
    const afterPayment = firstState.resources.wood;
    advance(room, clock, BUILDING_CONFIG.sawmill.levels[0]!.timeMs + 100);
    const completed = firstState.buildings.find((building) => building.type === "sawmill")!;
    expect(completed.status).toBe("active");
    advance(room, clock, 60_000);
    expect(firstState.resources.wood - afterPayment).toBeGreaterThan(145);

    firstState.resources.wood = MATCH_CONFIG.baseStorageCapacity - 1;
    advance(room, clock, 60_000);
    expect(firstState.resources.wood).toBe(MATCH_CONFIG.baseStorageCapacity);
    expect(room.createSnapshot(first.playerId, clock.now).self.resources.wood.capped).toBe(true);
  });

  it("upgrades the town hall and unlocks the next tier", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    fund(firstState);
    const locked = issue(room, first.playerId, "building:construct", { buildingType: "quarry" }, clock.now);
    expect(locked.error?.code).toBe("LOCKED");
    const townHall = firstState.buildings.find((building) => building.type === "townHall")!;
    expect(issue(room, first.playerId, "building:upgrade", { buildingId: townHall.id }, clock.now).ok).toBe(true);
    advance(room, clock, BUILDING_CONFIG.townHall.levels[1]!.timeMs);
    expect(townHall.level).toBe(2);
    expect(issue(room, first.playerId, "building:construct", { buildingType: "quarry" }, clock.now).ok).toBe(true);
  });

  it("grows population, reserves it for queues, trains units and refunds only 75% on cancellation", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    fund(firstState);
    expect(issue(room, first.playerId, "building:construct", { buildingType: "house" }, clock.now).ok).toBe(true);
    expect(issue(room, first.playerId, "building:construct", { buildingType: "barracks" }, clock.now).ok).toBe(true);
    firstState.populationCurrent = 16;
    advance(room, clock, 3_000);
    const beforeGrowth = firstState.populationCurrent;
    advance(room, clock, 60_000);
    expect(firstState.populationCurrent).toBeGreaterThan(beforeGrowth);

    const barracks = firstState.buildings.find((building) => building.type === "barracks")!;
    const foodBefore = firstState.resources.food;
    expect(
      issue(
        room,
        first.playerId,
        "training:queue",
        { buildingId: barracks.id, unitType: "infantry", count: 3 },
        clock.now,
      ).ok,
    ).toBe(true);
    expect(firstState.populationReserved).toBe(3);
    const queueId = firstState.trainingQueue[0]!.id;
    const afterPayment = firstState.resources.food;
    expect(issue(room, first.playerId, "training:cancel", { queueId }, clock.now).ok).toBe(true);
    expect(firstState.populationReserved).toBe(0);
    const fullFoodCost = UNIT_CONFIG.infantry.cost.food * 3;
    expect(firstState.resources.food).toBe(afterPayment + Math.floor(fullFoodCost * MATCH_CONFIG.trainingRefundRatio));
    expect(firstState.resources.food).toBeLessThan(foodBefore);

    expect(
      issue(
        room,
        first.playerId,
        "training:queue",
        { buildingId: barracks.id, unitType: "infantry", count: 2 },
        clock.now,
      ).ok,
    ).toBe(true);
    advance(room, clock, UNIT_CONFIG.infantry.trainingMs * 2 + 200);
    expect(firstState.garrison.infantry).toBe(2);
    expect(firstState.populationReserved).toBe(0);
    expect(firstState.stats.unitsTrained).toBe(2);
  });
});
