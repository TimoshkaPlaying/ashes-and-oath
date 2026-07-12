import {
  BUILDING_CONFIG,
  FORMATION_CONFIG,
  MATCH_CONFIG,
  UNIT_CONFIG,
  UNIT_TYPES,
  type BuildingType,
  type FinishReason,
  type Point,
  type UnitType,
} from "@ashes/shared";
import {
  getBuildingLevelConfig,
  getResearchMultiplier,
  getSquadMaxHp,
  getUnitMaxHp,
  populationForUnits,
  refreshSquadDerivedStats,
} from "./economy.js";
import type { GameEventSink, InternalBuildingState, InternalSquadState, MatchPlayerState, MatchState } from "./model.js";
import { distance, moveToward, round, sumUnits, zeroUnits } from "./math.js";
import { isPointVisible } from "./visibility.js";

export type FinishMatch = (winnerId: string, reason: FinishReason, now: number) => void;

const alive = (squad: InternalSquadState): boolean => squad.status !== "destroyed" && sumUnits(squad.composition) > 0;

const squadVision = (squad: InternalSquadState): number => {
  let vision: number = MATCH_CONFIG.defaultVisionRadius;
  for (const unitType of UNIT_TYPES) {
    if (squad.composition[unitType] > 0) vision = Math.max(vision, UNIT_CONFIG[unitType].vision);
  }
  return vision;
};

export const getSquadSpeed = (player: MatchPlayerState, squad: InternalSquadState): number => {
  let speed = Number.POSITIVE_INFINITY;
  for (const unitType of UNIT_TYPES) {
    if (squad.composition[unitType] <= 0) continue;
    let unitSpeed = UNIT_CONFIG[unitType].speed;
    if (unitType === "cavalry") unitSpeed *= getResearchMultiplier(player, "cavalrySpeed");
    speed = Math.min(speed, unitSpeed);
  }
  if (!Number.isFinite(speed)) return 0;
  return speed * FORMATION_CONFIG[squad.formation].speedMultiplier * getResearchMultiplier(player, "squadSpeed");
};

const updateTargetRoute = (
  squad: InternalSquadState,
  owner: MatchPlayerState,
  enemy: MatchPlayerState,
  revealAll: boolean,
): void => {
  const target = squad.target;
  if (!target) return;
  let destination: Point | null = null;
  if (target.kind === "enemySquad") {
    const targetSquad = enemy.squads.find((candidate) => candidate.id === target.squadId && alive(candidate));
    if (targetSquad && !isPointVisible(owner, targetSquad.position, revealAll)) {
      const lastKnown = squad.route.at(-1) ?? squad.position;
      squad.target = { kind: "position", position: { ...lastKnown } };
      return;
    }
    destination = targetSquad?.position ?? null;
  } else if (target.kind === "enemyBuilding") {
    const targetBuilding = enemy.buildings.find(
      (candidate) => candidate.id === target.buildingId && candidate.status !== "destroyed",
    );
    destination = targetBuilding?.position ?? null;
  } else if (target.kind === "enemyBase") {
    destination = MATCH_CONFIG.basePositions[enemy.baseIndex];
  } else if (target.kind === "defendBase" || target.kind === "home") {
    destination = MATCH_CONFIG.basePositions[owner.baseIndex];
  } else {
    destination = target.position;
  }
  if (!destination) {
    squad.target = null;
    squad.route = [];
    squad.status = "idle";
    squad.etaMs = null;
    return;
  }
  if (squad.route.length === 0) squad.route.push({ ...destination });
  else if (target.kind !== "position") squad.route[squad.route.length - 1] = { ...destination };
};

const routeDistance = (squad: InternalSquadState): number => {
  let total = 0;
  let previous = squad.position;
  for (const point of squad.route) {
    total += distance(previous, point);
    previous = point;
  }
  return total;
};

const tickMovement = (
  player: MatchPlayerState,
  enemy: MatchPlayerState,
  deltaMs: number,
  now: number,
  emit: GameEventSink,
  revealAll = false,
  preparationOnly = false,
): void => {
  for (const squad of player.squads) {
    if (!alive(squad) || squad.status === "healing") continue;
    if (preparationOnly) {
      const base = MATCH_CONFIG.basePositions[player.baseIndex];
      const currentOutside = distance(squad.position, base) > MATCH_CONFIG.baseBuildRadius;
      const targetOutside = squad.target?.kind === "position" && distance(squad.target.position, base) > MATCH_CONFIG.baseBuildRadius;
      const offensiveTarget = squad.target?.kind === "enemySquad" || squad.target?.kind === "enemyBuilding" || squad.target?.kind === "enemyBase";
      const routeOutside = squad.route.some((point) => distance(point, base) > MATCH_CONFIG.baseBuildRadius);
      if (currentOutside) squad.position = moveToward(base, squad.position, MATCH_CONFIG.baseBuildRadius);
      if (currentOutside || targetOutside || offensiveTarget || routeOutside) {
        squad.route = [];
        squad.target = null;
        squad.status = "idle";
        squad.etaMs = null;
        continue;
      }
    }
    updateTargetRoute(squad, player, enemy, revealAll);
    const speed = getSquadSpeed(player, squad);
    squad.speed = round(speed);
    if (squad.route.length === 0 || speed <= 0) {
      squad.etaMs = null;
      continue;
    }
    let remainingMovement = (speed * deltaMs) / 1_000;
    let moved = false;
    while (remainingMovement > 0 && squad.route.length > 0) {
      const waypoint = squad.route[0];
      if (!waypoint) break;
      const toWaypoint = distance(squad.position, waypoint);
      if (toWaypoint <= remainingMovement || toWaypoint <= MATCH_CONFIG.squadArrivalDistance) {
        squad.position = { ...waypoint };
        squad.route.shift();
        remainingMovement -= toWaypoint;
        moved = true;
      } else {
        squad.position = moveToward(squad.position, waypoint, remainingMovement);
        remainingMovement = 0;
        moved = true;
      }
    }
    squad.etaMs = speed > 0 ? Math.round((routeDistance(squad) / speed) * 1_000) : null;
    if (moved && squad.status !== "retreating" && squad.status !== "returning") squad.status = "moving";
    if (squad.route.length === 0) {
      const completedTarget = squad.target;
      if (completedTarget?.kind === "position" || completedTarget?.kind === "defendBase" || completedTarget?.kind === "home") {
        squad.status = "idle";
        squad.target = completedTarget.kind === "defendBase" ? completedTarget : null;
        squad.etaMs = null;
        emit({
          type: "squadMoved",
          serverTime: now,
          message: `${squad.name} прибыл к цели`,
          playerId: player.playerId,
          entityIds: [squad.id],
          position: { ...squad.position },
        });
      }
    }
  }
};

const autoAcquireTargets = (player: MatchPlayerState, enemy: MatchPlayerState): void => {
  for (const squad of player.squads) {
    if (!alive(squad) || squad.status === "healing" || squad.status === "retreating" || squad.status === "returning") continue;
    if (squad.target || squad.behavior === "avoidCombat") continue;
    const vision = squadVision(squad);
    const candidates = enemy.squads
      .filter(alive)
      .map((candidate) => ({ candidate, range: distance(squad.position, candidate.position) }))
      .filter(({ range }) => range <= vision)
      .sort((a, b) => a.range - b.range);
    if (squad.behavior === "buildingsOnly") {
      const building = enemy.buildings
        .filter((candidate) => candidate.status !== "destroyed")
        .map((candidate) => ({ candidate, range: distance(squad.position, candidate.position) }))
        .filter(({ range }) => range <= vision)
        .sort((a, b) => a.range - b.range)[0]?.candidate;
      if (building) {
        squad.target = { kind: "enemyBuilding", buildingId: building.id };
        squad.route = [{ ...building.position }];
        squad.status = "moving";
      }
      continue;
    }
    const nearest = candidates[0]?.candidate;
    if (!nearest) continue;
    if (squad.behavior === "holdPosition") continue;
    if (squad.behavior === "defensive") {
      const home = MATCH_CONFIG.basePositions[player.baseIndex];
      if (distance(nearest.position, home) > MATCH_CONFIG.baseBuildRadius * 1.7) continue;
    }
    squad.target = { kind: "enemySquad", squadId: nearest.id };
    squad.route = [{ ...nearest.position }];
    squad.status = "moving";
  }
};

const targetRatios = (squad: InternalSquadState): Record<UnitType, number> => {
  const total = Math.max(1, sumUnits(squad.composition));
  return {
    infantry: squad.composition.infantry / total,
    archer: squad.composition.archer / total,
    cavalry: squad.composition.cavalry / total,
    catapult: squad.composition.catapult / total,
  };
};

const attackResearchMultiplier = (player: MatchPlayerState, unitType: UnitType): number => {
  if (unitType === "infantry") return getResearchMultiplier(player, "infantryDamage");
  if (unitType === "archer") return getResearchMultiplier(player, "arrowDamage");
  if (unitType === "catapult") return getResearchMultiplier(player, "catapultDamage");
  return 1;
};

const counterMultiplier = (
  unitType: UnitType,
  attacker: InternalSquadState,
  target: InternalSquadState,
  separation: number,
): number => {
  const ratios = targetRatios(target);
  if (unitType === "cavalry") {
    const defensivePenalty = target.formation === "defensive" ? ratios.infantry * 0.55 : 0;
    return Math.max(0.55, 1 + ratios.archer * 0.65 - ratios.infantry * 0.18 - defensivePenalty);
  }
  if (unitType === "archer") return Math.max(0.55, 1 + ratios.infantry * 0.42 - ratios.cavalry * 0.38);
  if (unitType === "infantry") {
    return attacker.formation === "defensive" ? 1 + ratios.cavalry * 0.48 : 1;
  }
  const densityBonus = sumUnits(target.composition) >= 14 ? 1.25 : 1;
  return separation < 40 ? densityBonus * 0.55 : densityBonus;
};

const targetArmor = (player: MatchPlayerState, squad: InternalSquadState): number => {
  const total = Math.max(1, sumUnits(squad.composition));
  const weighted = UNIT_TYPES.reduce(
    (sum, unitType) => sum + squad.composition[unitType] * UNIT_CONFIG[unitType].armor,
    0,
  );
  return (weighted / total) * getResearchMultiplier(player, "armor") * FORMATION_CONFIG[squad.formation].armorMultiplier;
};

const priorityForAttack = (unitType: UnitType): readonly UnitType[] => {
  if (unitType === "cavalry") return ["archer", "catapult", "infantry", "cavalry"];
  if (unitType === "archer") return ["infantry", "archer", "catapult", "cavalry"];
  if (unitType === "infantry") return ["cavalry", "infantry", "archer", "catapult"];
  return ["catapult", "archer", "infantry", "cavalry"];
};

const killUnitsFromHealth = (
  defender: MatchPlayerState,
  squad: InternalSquadState,
  unitType: UnitType,
  previousCount: number,
  now: number,
): number => {
  const maxHp = getUnitMaxHp(defender, unitType);
  const remainingCount = squad.unitHealth[unitType] <= 0 ? 0 : Math.ceil(squad.unitHealth[unitType] / maxHp);
  squad.composition[unitType] = Math.min(previousCount, remainingCount);
  const killed = previousCount - squad.composition[unitType];
  if (killed > 0) {
    defender.pendingPopulationRelease.push({
      amount: killed * UNIT_CONFIG[unitType].population,
      releasesAt: now + MATCH_CONFIG.populationReleaseDelayMs,
    });
  }
  return killed;
};

const applySquadDamage = (
  attackerPlayer: MatchPlayerState | null,
  defenderPlayer: MatchPlayerState,
  target: InternalSquadState,
  rawDamage: number,
  sourceUnitType: UnitType,
  now: number,
  emit: GameEventSink,
  sourceId: string,
): number => {
  const armor = targetArmor(defenderPlayer, target);
  let damage = rawDamage * (1 - Math.min(0.64, armor / 42));
  const formation = FORMATION_CONFIG[target.formation];
  if (sourceUnitType === "archer") damage *= formation.rangedDamageTakenMultiplier;
  if (sourceUnitType === "cavalry") damage *= formation.cavalryDamageTakenMultiplier;
  if (sourceUnitType === "cavalry" && target.formation === "protectSiege") damage *= formation.siegeProtectionMultiplier;
  if (target.status === "retreating") damage *= 1.1;
  damage = Math.max(1, damage);
  let remaining = damage;
  let totalKilled = 0;
  for (const unitType of priorityForAttack(sourceUnitType)) {
    if (remaining <= 0 || target.composition[unitType] <= 0) continue;
    const previousCount = target.composition[unitType];
    const absorbed = Math.min(remaining, target.unitHealth[unitType]);
    target.unitHealth[unitType] = Math.max(0, target.unitHealth[unitType] - absorbed);
    remaining -= absorbed;
    const killed = killUnitsFromHealth(defenderPlayer, target, unitType, previousCount, now);
    totalKilled += killed;
    if (killed > 0) {
      emit({
        type: "unitKilled",
        serverTime: now,
        message: `Потери: ${killed} × ${UNIT_CONFIG[unitType].label}`,
        playerId: defenderPlayer.playerId,
        entityIds: [sourceId, target.id],
        position: { ...target.position },
        amount: killed,
        unitType,
      });
    }
  }
  const applied = damage - remaining;
  defenderPlayer.stats.damageTaken += applied;
  defenderPlayer.stats.unitsLost += totalKilled;
  if (attackerPlayer) {
    attackerPlayer.stats.damageDealt += applied;
    attackerPlayer.stats.unitsKilled += totalKilled;
  }
  refreshSquadDerivedStats(defenderPlayer, target);
  target.lastCombatAt = now;
  if (sumUnits(target.composition) === 0 || target.hp <= 0) {
    target.status = "destroyed";
    target.route = [];
    target.target = null;
    target.etaMs = null;
    emit({
      type: "squadDestroyed",
      serverTime: now,
      message: `${target.name} уничтожен`,
      playerId: defenderPlayer.playerId,
      entityIds: [sourceId, target.id],
      position: { ...target.position },
    });
  } else if (target.status !== "retreating") {
    target.status = "fighting";
  }
  return applied;
};

const attackSquad = (
  attackerPlayer: MatchPlayerState,
  attacker: InternalSquadState,
  defenderPlayer: MatchPlayerState,
  defender: InternalSquadState,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
): void => {
  if (
    !alive(attacker) ||
    !alive(defender) ||
    attacker.behavior === "avoidCombat" ||
    attacker.behavior === "buildingsOnly"
  ) return;
  const separation = distance(attacker.position, defender.position);
  for (const unitType of UNIT_TYPES) {
    const count = attacker.composition[unitType];
    if (count <= 0 || now < attacker.attackReadyAt[unitType]) continue;
    let range = UNIT_CONFIG[unitType].range;
    if (unitType === "archer") range *= getResearchMultiplier(attackerPlayer, "archerRange");
    if (separation > range + MATCH_CONFIG.squadCollisionDistance * 0.5) continue;
    let rawDamage = count * UNIT_CONFIG[unitType].damage;
    rawDamage *= attackResearchMultiplier(attackerPlayer, unitType);
    rawDamage *= FORMATION_CONFIG[attacker.formation].damageMultiplier;
    rawDamage *= counterMultiplier(unitType, attacker, defender, separation);
    if (finalBattle) rawDamage *= MATCH_CONFIG.finalBattle.damageMultiplier;
    const applied = applySquadDamage(
      attackerPlayer,
      defenderPlayer,
      defender,
      rawDamage,
      unitType,
      now,
      emit,
      attacker.id,
    );
    attacker.attackReadyAt[unitType] = now + UNIT_CONFIG[unitType].attackIntervalMs;
    attacker.lastCombatAt = now;
    if (attacker.status !== "retreating") attacker.status = "fighting";
    emit({
      type: "combatHit",
      serverTime: now,
      message: `${UNIT_CONFIG[unitType].label}: ${Math.round(applied)} урона`,
      playerId: attackerPlayer.playerId,
      entityIds: [attacker.id, defender.id],
      position: { ...defender.position },
      amount: round(applied),
      unitType,
    });
    if (!alive(defender)) break;

    if (unitType === "catapult") {
      for (const splash of defenderPlayer.squads) {
        if (splash.id === defender.id || !alive(splash) || distance(splash.position, defender.position) > 62) continue;
        applySquadDamage(attackerPlayer, defenderPlayer, splash, rawDamage * 0.22, unitType, now, emit, attacker.id);
      }
    }
  }
};

const barrierForTarget = (
  enemy: MatchPlayerState,
  intended: InternalBuildingState | undefined,
): InternalBuildingState | undefined => {
  if (!intended || intended.type === "wall" || intended.type === "gate") return intended;
  const gate = enemy.buildings.find((building) => building.type === "gate" && building.status !== "destroyed");
  if (gate && gate.gateOpen === false) return gate;
  if (gate?.gateOpen === true) return intended;
  return enemy.buildings.find((building) => building.type === "wall" && building.status !== "destroyed") ?? intended;
};

const resolveBuildingTarget = (squad: InternalSquadState, enemy: MatchPlayerState): InternalBuildingState | undefined => {
  if (squad.target?.kind === "enemyBase") {
    const townHall = enemy.buildings.find((building) => building.type === "townHall" && building.status !== "destroyed");
    return barrierForTarget(enemy, townHall);
  }
  if (squad.target?.kind !== "enemyBuilding") return undefined;
  const explicit = enemy.buildings.find(
    (building) =>
      squad.target?.kind === "enemyBuilding" && building.id === squad.target.buildingId && building.status !== "destroyed",
  );
  if (!explicit) return undefined;
  return barrierForTarget(enemy, explicit);
};

const buildingDamageResistance = (type: BuildingType): number => {
  if (type === "wall") return 0.72;
  if (type === "gate") return 0.82;
  if (type === "townHall") return 0.9;
  return 1;
};

const attackBuilding = (
  attackerPlayer: MatchPlayerState,
  squad: InternalSquadState,
  defenderPlayer: MatchPlayerState,
  building: InternalBuildingState,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
  finish: FinishMatch,
): void => {
  if (!alive(squad) || building.status === "destroyed") return;
  const separation = distance(squad.position, building.position);
  let attacked = false;
  for (const unitType of UNIT_TYPES) {
    const count = squad.composition[unitType];
    if (count <= 0 || now < squad.attackReadyAt[unitType]) continue;
    let range = UNIT_CONFIG[unitType].range;
    if (unitType === "archer") range *= getResearchMultiplier(attackerPlayer, "archerRange");
    if (separation > range + 34) continue;
    let damage = count * UNIT_CONFIG[unitType].damage * UNIT_CONFIG[unitType].buildingDamageMultiplier;
    damage *= attackResearchMultiplier(attackerPlayer, unitType);
    damage *= getResearchMultiplier(attackerPlayer, "buildingDamage");
    damage *= FORMATION_CONFIG[squad.formation].damageMultiplier;
    damage *= buildingDamageResistance(building.type);
    if (finalBattle) damage *= MATCH_CONFIG.finalBattle.damageMultiplier;
    damage = Math.max(1, damage);
    building.hp = Math.max(0, building.hp - damage);
    attackerPlayer.stats.damageDealt += damage;
    defenderPlayer.stats.damageTaken += damage;
    squad.attackReadyAt[unitType] = now + UNIT_CONFIG[unitType].attackIntervalMs;
    squad.lastCombatAt = now;
    attacked = true;
    emit({
      type: "buildingDamaged",
      serverTime: now,
      message: `${BUILDING_CONFIG[building.type].label}: ${Math.round(damage)} урона`,
      playerId: attackerPlayer.playerId,
      entityIds: [squad.id, building.id],
      position: { ...building.position },
      amount: round(damage),
      unitType,
    });
    if (building.hp <= 0) break;
  }
  if (attacked) squad.status = "attackingBuilding";
  if (building.hp > 0) return;
  building.status = "destroyed";
  building.progress = 0;
  building.startedAt = null;
  building.completesAt = null;
  building.pendingLevel = null;
  attackerPlayer.stats.buildingsDestroyed += 1;
  emit({
    type: "buildingDestroyed",
    serverTime: now,
    message: `${BUILDING_CONFIG[building.type].label} разрушено`,
    playerId: defenderPlayer.playerId,
    entityIds: [squad.id, building.id],
    position: { ...building.position },
  });
  if (building.type === "townHall") finish(attackerPlayer.playerId, "townHallDestroyed", now);
};

const tickSquadCombat = (
  first: MatchPlayerState,
  second: MatchPlayerState,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
): void => {
  for (const firstSquad of first.squads) {
    if (!alive(firstSquad)) continue;
    for (const secondSquad of second.squads) {
      if (!alive(secondSquad)) continue;
      const separation = distance(firstSquad.position, secondSquad.position);
      const relevant = separation <= Math.max(squadVision(firstSquad), squadVision(secondSquad));
      if (!relevant) continue;
      attackSquad(first, firstSquad, second, secondSquad, now, finalBattle, emit);
      attackSquad(second, secondSquad, first, firstSquad, now, finalBattle, emit);
      if (!alive(firstSquad)) break;
    }
  }
};

const tickBuildingAttacks = (
  attacker: MatchPlayerState,
  defender: MatchPlayerState,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
  finish: FinishMatch,
): void => {
  for (const squad of attacker.squads) {
    if (!alive(squad)) continue;
    const target = resolveBuildingTarget(squad, defender);
    if (!target) continue;
    if (!isPointVisible(attacker, target.position, finalBattle)) continue;
    squad.route = [{ ...target.position }];
    attackBuilding(attacker, squad, defender, target, now, finalBattle, emit, finish);
  }
};

const tickTowers = (owner: MatchPlayerState, enemy: MatchPlayerState, now: number, emit: GameEventSink): void => {
  for (const tower of owner.buildings) {
    if (tower.type !== "tower" || tower.status !== "active" || now < tower.lastTowerAttackAt + MATCH_CONFIG.towerAttackIntervalMs) {
      continue;
    }
    const level = getBuildingLevelConfig(tower);
    const range = level.towerRange ?? 0;
    const target = enemy.squads
      .filter(alive)
      .map((squad) => ({ squad, range: distance(tower.position, squad.position) }))
      .filter((candidate) => candidate.range <= range)
      .sort((a, b) => a.range - b.range)[0]?.squad;
    if (!target) continue;
    tower.lastTowerAttackAt = now;
    const damage = level.towerDamage ?? 0;
    const applied = applySquadDamage(owner, enemy, target, damage, "archer", now, emit, tower.id);
    emit({
      type: "combatHit",
      serverTime: now,
      message: `Башня наносит ${Math.round(applied)} урона`,
      playerId: owner.playerId,
      entityIds: [tower.id, target.id],
      position: { ...target.position },
      amount: round(applied),
      unitType: "archer",
    });
  }
};

const clearStaleCombatStatuses = (player: MatchPlayerState, now: number): void => {
  for (const squad of player.squads) {
    if (!alive(squad)) continue;
    if (
      (squad.status === "fighting" || squad.status === "attackingBuilding") &&
      squad.lastCombatAt !== null &&
      now - squad.lastCombatAt > 1_800
    ) {
      squad.status = squad.route.length > 0 ? "moving" : "idle";
    }
    refreshSquadDerivedStats(player, squad);
  }
};

export const tickCombat = (
  match: MatchState,
  deltaMs: number,
  now: number,
  emit: GameEventSink,
  finish: FinishMatch,
): void => {
  if (match.phase === "finished") return;
  const players = [...match.players.values()];
  const first = players[0];
  const second = players[1];
  if (!first || !second) return;
  if (match.phase === "truce") {
    tickMovement(first, second, deltaMs, now, emit, false, true);
    tickMovement(second, first, deltaMs, now, emit, false, true);
    return;
  }
  autoAcquireTargets(first, second);
  autoAcquireTargets(second, first);
  tickMovement(first, second, deltaMs, now, emit, match.phase === "lastBattle");
  tickMovement(second, first, deltaMs, now, emit, match.phase === "lastBattle");
  tickSquadCombat(first, second, now, match.phase === "lastBattle", emit);
  tickBuildingAttacks(first, second, now, match.phase === "lastBattle", emit, finish);
  tickBuildingAttacks(second, first, now, match.phase === "lastBattle", emit, finish);
  tickTowers(first, second, now, emit);
  tickTowers(second, first, now, emit);
  clearStaleCombatStatuses(first, now);
  clearStaleCombatStatuses(second, now);
};

export const applyLastBattleBuildingPenalty = (player: MatchPlayerState): void => {
  for (const building of player.buildings) {
    if (building.status === "destroyed") continue;
    building.maxHp *= MATCH_CONFIG.finalBattle.buildingHpMultiplier;
    building.hp = Math.min(building.hp, building.maxHp);
  }
};
