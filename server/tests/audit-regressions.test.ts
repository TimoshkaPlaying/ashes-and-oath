import {
  BUILDING_CONFIG,
  MATCH_CONFIG,
  UNIT_CONFIG,
  type BuildingType,
  type GameEvent,
} from "@ashes/shared";
import { describe, expect, it } from "vitest";
import { getStorageCapacity } from "../src/game/economy.js";
import type { InternalBuildingState, InternalSquadState, MatchPlayerState } from "../src/game/model.js";
import { advance, createStartedRoom, fund, issue } from "./helpers.js";

let entityCounter = 0;

const addBuilding = (
  player: MatchPlayerState,
  type: BuildingType,
  position: { x: number; y: number },
  level = 1,
): InternalBuildingState => {
  entityCounter += 1;
  const balance = BUILDING_CONFIG[type].levels[level - 1]!;
  const building: InternalBuildingState = {
    id: `audit_building_${entityCounter}`,
    ownerId: player.playerId,
    type,
    level,
    status: "active",
    hp: balance.maxHp,
    maxHp: balance.maxHp,
    progress: 1,
    position: { ...position },
    startedAt: null,
    completesAt: null,
    gateOpen: type === "gate" ? false : null,
    pendingLevel: null,
    lastTowerAttackAt: 0,
  };
  player.buildings.push(building);
  return building;
};

const createInfantrySquad = (
  room: ReturnType<typeof createStartedRoom>["room"],
  playerId: string,
  player: MatchPlayerState,
  now: number,
  behavior: InternalSquadState["behavior"] = "aggressive",
): InternalSquadState => {
  player.garrison.infantry += 4;
  const result = issue(
    room,
    playerId,
    "squad:create",
    {
      name: `Audit ${player.squads.length + 1}`,
      composition: { infantry: 4, archer: 0, cavalry: 0, catapult: 0 },
      formation: "line",
      behavior,
    },
    now,
  );
  expect(result.ok).toBe(true);
  return player.squads.at(-1)!;
};

describe("audit security and gameplay regressions", () => {
  it("rejects every truce escape path and freezes a forged route before movement", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    const squad = createInfantrySquad(room, first.playerId, firstState, clock.now);
    const base = MATCH_CONFIG.basePositions[firstState.baseIndex];
    const safeDestination = { x: base.x + 40, y: base.y };
    const outside = { x: base.x + MATCH_CONFIG.baseBuildRadius + 80, y: base.y };

    const routedEscape = issue(
      room,
      first.playerId,
      "squad:move",
      { squadId: squad.id, route: [outside], destination: safeDestination },
      clock.now,
    );
    expect(routedEscape.error?.code).toBe("TRUCE_ACTIVE");

    const positionEscape = issue(
      room,
      first.playerId,
      "squad:target",
      { squadId: squad.id, target: { kind: "position", position: outside } },
      clock.now,
    );
    expect(positionEscape.error?.code).toBe("TRUCE_ACTIVE");

    const before = { ...squad.position };
    squad.route = [outside, safeDestination];
    squad.target = { kind: "position", position: safeDestination };
    squad.status = "moving";
    advance(room, clock, 100);
    expect(squad.position).toEqual(before);
    expect(squad.route).toEqual([]);
    expect(squad.target).toBeNull();
    expect(squad.status).toBe("idle");
  });

  it("lets enemy squads damage a buildings-only squad without taking return fire", () => {
    const { room, clock, first, second, match, firstState, secondState } = createStartedRoom();
    clock.now = match.truceEndsAt;
    room.tick(clock.now);
    const siege = createInfantrySquad(room, first.playerId, firstState, clock.now, "buildingsOnly");
    const defender = createInfantrySquad(room, second.playerId, secondState, clock.now, "aggressive");
    siege.position = { x: 980, y: 500 };
    defender.position = { x: 990, y: 500 };
    const siegeHp = siege.hp;
    const defenderHp = defender.hp;

    advance(room, clock, 100);

    expect(siege.hp).toBeLessThan(siegeHp);
    expect(defender.hp).toBe(defenderHp);
  });

  it("rejects zero-output market trades and makes every round trip lossy", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    addBuilding(firstState, "market", { x: 240, y: 500 });
    firstState.resources.food = 100;
    firstState.resources.gold = 10;

    const tiny = issue(
      room,
      first.playerId,
      "market:trade",
      { sell: "food", buy: "gold", amount: 1 },
      clock.now,
    );
    expect(tiny.error?.code).toBe("INVALID_COMMAND");
    expect(firstState.resources.food).toBe(100);
    expect(firstState.resources.gold).toBe(10);

    expect(issue(room, first.playerId, "market:trade", { sell: "gold", buy: "food", amount: 10 }, clock.now).ok).toBe(true);
    const receivedFood = firstState.resources.food - 100;
    expect(receivedFood).toBeGreaterThan(0);
    expect(issue(room, first.playerId, "market:trade", { sell: "food", buy: "gold", amount: receivedFood }, clock.now).ok).toBe(true);
    expect(firstState.resources.gold).toBeLessThan(10);
  });

  it("rejects hidden entity IDs and stops live tracking when a squad leaves vision", () => {
    const { room, clock, first, second, match, firstState, secondState } = createStartedRoom();
    clock.now = match.truceEndsAt;
    room.tick(clock.now);
    const hunter = createInfantrySquad(room, first.playerId, firstState, clock.now);
    const hidden = createInfantrySquad(room, second.playerId, secondState, clock.now);
    hidden.position = { x: 1_200, y: 500 };

    const rejected = issue(
      room,
      first.playerId,
      "squad:target",
      { squadId: hunter.id, target: { kind: "enemySquad", squadId: hidden.id } },
      clock.now,
    );
    expect(rejected.error?.code).toBe("INVALID_TARGET");

    hidden.position = { x: 300, y: 500 };
    expect(
      issue(
        room,
        first.playerId,
        "squad:target",
        { squadId: hunter.id, target: { kind: "enemySquad", squadId: hidden.id } },
        clock.now,
      ).ok,
    ).toBe(true);
    const lastKnown = { ...hidden.position };
    hidden.position = { x: 1_200, y: 500 };
    advance(room, clock, 100);

    expect(hunter.target).toEqual({ kind: "position", position: lastKnown });
    expect(hunter.route.at(-1)).toEqual(lastKnown);
    expect(hunter.route.at(-1)).not.toEqual(hidden.position);
  });

  it("filters private and fogged events while preserving own and global events", () => {
    const { room, clock, first, second, match } = createStartedRoom();
    const privateEvent: GameEvent = {
      id: "private",
      type: "unitTrained",
      serverTime: clock.now,
      message: "private",
      playerId: second.playerId,
      unitType: "infantry",
    };
    expect(room.isEventVisibleTo(first.playerId, privateEvent)).toBe(false);
    expect(room.isEventVisibleTo(second.playerId, privateEvent)).toBe(true);

    clock.now = match.truceEndsAt;
    room.tick(clock.now);
    const foggedEvent: GameEvent = {
      id: "fogged",
      type: "buildingDamaged",
      serverTime: clock.now,
      message: "fogged",
      playerId: second.playerId,
      position: { ...MATCH_CONFIG.basePositions[secondStateIndex(match, second.playerId)] },
    };
    expect(room.isEventVisibleTo(first.playerId, foggedEvent)).toBe(false);
    expect(
      room.isEventVisibleTo(first.playerId, {
        id: "global",
        type: "truceEnded",
        serverTime: clock.now,
        message: "global",
      }),
    ).toBe(true);
  });

  it("cancels training reservations when the producing building is destroyed", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    fund(firstState);
    const barracks = addBuilding(firstState, "barracks", { x: 230, y: 500 });
    expect(
      issue(
        room,
        first.playerId,
        "training:queue",
        { buildingId: barracks.id, unitType: "infantry", count: 2 },
        clock.now,
      ).ok,
    ).toBe(true);
    barracks.status = "destroyed";
    barracks.hp = 0;

    advance(room, clock, UNIT_CONFIG.infantry.trainingMs * 3);

    expect(firstState.garrison.infantry).toBe(0);
    expect(firstState.trainingQueue).toEqual([]);
    expect(firstState.populationReserved).toBe(0);
  });

  it("keeps walls and closed gates as barriers for attacks on every protected building", () => {
    const { room, clock, first, match, firstState, secondState } = createStartedRoom();
    clock.now = match.truceEndsAt;
    room.tick(clock.now);
    firstState.garrison.catapult = 2;
    expect(
      issue(
        room,
        first.playerId,
        "squad:create",
        {
          name: "Siege",
          composition: { infantry: 0, archer: 0, cavalry: 0, catapult: 2 },
          formation: "protectSiege",
          behavior: "buildingsOnly",
        },
        clock.now,
      ).ok,
    ).toBe(true);
    const squad = firstState.squads.at(-1)!;
    squad.position = { x: 800, y: 500 };
    const wall = addBuilding(secondState, "wall", { x: 900, y: 500 });
    const farm = addBuilding(secondState, "farm", { x: 930, y: 500 });
    const wallHp = wall.hp;
    const farmHp = farm.hp;
    expect(
      issue(
        room,
        first.playerId,
        "squad:target",
        { squadId: squad.id, target: { kind: "enemyBuilding", buildingId: farm.id } },
        clock.now,
      ).ok,
    ).toBe(true);

    advance(room, clock, 100);

    expect(wall.hp).toBeLessThan(wallHp);
    expect(farm.hp).toBe(farmHp);
  });

  it("retains warehouse capacity and resources throughout an upgrade", () => {
    const { room, clock, first, firstState } = createStartedRoom();
    fund(firstState);
    const townHall = firstState.buildings.find((building) => building.type === "townHall")!;
    townHall.level = 2;
    townHall.maxHp = BUILDING_CONFIG.townHall.levels[1]!.maxHp;
    townHall.hp = townHall.maxHp;
    const warehouse = addBuilding(firstState, "warehouse", { x: 230, y: 500 });
    const capacity = getStorageCapacity(firstState);
    expect(capacity).toBe(MATCH_CONFIG.baseStorageCapacity + BUILDING_CONFIG.warehouse.levels[0]!.storageBonus!);
    expect(issue(room, first.playerId, "building:upgrade", { buildingId: warehouse.id }, clock.now).ok).toBe(true);
    firstState.resources.wood = capacity - 25;

    advance(room, clock, 100);

    expect(warehouse.status).toBe("upgrading");
    expect(getStorageCapacity(firstState)).toBe(capacity);
    expect(firstState.resources.wood).toBe(capacity - 25);
  });

  it("applies Last Battle training and HP modifiers to existing and newly created work", () => {
    const { room, clock, first, match, firstState } = createStartedRoom();
    fund(firstState);
    const barracks = addBuilding(firstState, "barracks", { x: 230, y: 500 });
    clock.now = match.lastBattleStartsAt - 1_000;
    room.tick(clock.now);
    expect(
      issue(
        room,
        first.playerId,
        "training:queue",
        { buildingId: barracks.id, unitType: "infantry", count: 2 },
        clock.now,
      ).ok,
    ).toBe(true);
    const existing = firstState.trainingQueue[0]!;
    const originalTrainingMs = existing.trainingMs;
    const originalTownHallMaxHp = firstState.buildings.find((building) => building.type === "townHall")!.maxHp;

    clock.now = match.lastBattleStartsAt;
    room.tick(clock.now);

    expect(match.phase).toBe("lastBattle");
    expect(existing.trainingMs).toBe(Math.max(400, Math.round(originalTrainingMs * MATCH_CONFIG.finalBattle.trainingTimeMultiplier)));
    expect(firstState.buildings.find((building) => building.type === "townHall")!.maxHp).toBe(
      originalTownHallMaxHp * MATCH_CONFIG.finalBattle.buildingHpMultiplier,
    );

    expect(
      issue(
        room,
        first.playerId,
        "training:queue",
        { buildingId: barracks.id, unitType: "infantry", count: 1 },
        clock.now,
      ).ok,
    ).toBe(true);
    expect(firstState.trainingQueue.at(-1)!.trainingMs).toBe(existing.trainingMs);

    expect(issue(room, first.playerId, "building:construct", { buildingType: "sawmill" }, clock.now).ok).toBe(true);
    const sawmill = firstState.buildings.find((building) => building.type === "sawmill")!;
    const expectedMaxHp = BUILDING_CONFIG.sawmill.levels[0]!.maxHp * MATCH_CONFIG.finalBattle.buildingHpMultiplier;
    expect(sawmill.maxHp).toBe(expectedMaxHp);
    advance(room, clock, BUILDING_CONFIG.sawmill.levels[0]!.timeMs + 1);
    expect(sawmill.status).toBe("active");
    expect(sawmill.maxHp).toBe(expectedMaxHp);
  });
});

const secondStateIndex = (
  match: ReturnType<typeof createStartedRoom>["match"],
  playerId: string,
): 0 | 1 => match.players.get(playerId)!.baseIndex;
