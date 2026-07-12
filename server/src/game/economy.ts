import {
  BUILDING_CONFIG,
  MATCH_CONFIG,
  RESEARCH_CONFIG,
  RESOURCE_KINDS,
  UNIT_CONFIG,
  UNIT_TYPES,
  type BuildingLevelConfig,
  type MatchStats,
  type PopulationView,
  type ResearchType,
  type ResourceAmounts,
  type ResourceKind,
  type ResourceViews,
  type UnitType,
} from "@ashes/shared";
import type {
  GameEventSink,
  InternalBuildingState,
  InternalSquadState,
  MatchPlayerState,
} from "./model.js";
import { round, zeroResources } from "./math.js";

const PRODUCTION_RESEARCH: Record<ResourceKind, ResearchType> = {
  wood: "woodProduction",
  stone: "stoneProduction",
  gold: "goldProduction",
  iron: "ironProduction",
  food: "foodProduction",
};

export const getBuildingLevelConfig = (building: InternalBuildingState): BuildingLevelConfig => {
  const level = BUILDING_CONFIG[building.type].levels[building.level - 1];
  if (!level) throw new Error(`Missing balance for ${building.type} level ${building.level}`);
  return level;
};

export const getTownHall = (player: MatchPlayerState): InternalBuildingState | undefined =>
  player.buildings.find((building) => building.type === "townHall" && building.status !== "destroyed");

export const getTownHallLevel = (player: MatchPlayerState): number => getTownHall(player)?.level ?? 0;

export const getResearchLevel = (player: MatchPlayerState, type: ResearchType): number => player.researchLevels[type] ?? 0;

export const getResearchMultiplier = (player: MatchPlayerState, type: ResearchType): number =>
  1 + getResearchLevel(player, type) * RESEARCH_CONFIG[type].effectPerLevel;

export const getStorageCapacity = (player: MatchPlayerState): number => {
  let capacity = MATCH_CONFIG.baseStorageCapacity;
  for (const building of player.buildings) {
    if ((building.status !== "active" && building.status !== "upgrading") || building.type !== "warehouse") continue;
    capacity += getBuildingLevelConfig(building).storageBonus ?? 0;
  }
  return Math.floor(capacity * getResearchMultiplier(player, "storageCapacity"));
};

export const getPopulationCapacity = (player: MatchPlayerState): number => {
  let capacity = MATCH_CONFIG.startingPopulationCapacity;
  for (const building of player.buildings) {
    if (building.status !== "active" || building.type !== "house") continue;
    capacity += getBuildingLevelConfig(building).populationCapacityBonus ?? 0;
  }
  return Math.floor(capacity * getResearchMultiplier(player, "populationCapacity"));
};

export const getPopulationPerMinute = (player: MatchPlayerState): number => {
  let rate = 0;
  for (const building of player.buildings) {
    if (building.status !== "active" || building.type !== "house") continue;
    rate += getBuildingLevelConfig(building).populationPerMinute ?? 0;
  }
  return rate;
};

export const populationForUnits = (counts: Readonly<Record<UnitType, number>>): number =>
  UNIT_TYPES.reduce((total, unitType) => total + counts[unitType] * UNIT_CONFIG[unitType].population, 0);

export const getUsedPopulation = (player: MatchPlayerState): number => {
  let used = populationForUnits(player.garrison) + player.populationReserved;
  for (const squad of player.squads) {
    if (squad.status !== "destroyed") used += populationForUnits(squad.composition);
  }
  used += player.pendingPopulationRelease.reduce((sum, release) => sum + release.amount, 0);
  return used;
};

export const getPopulationView = (player: MatchPlayerState): PopulationView => {
  const used = getUsedPopulation(player);
  const capacity = getPopulationCapacity(player);
  return {
    current: Math.floor(player.populationCurrent),
    used,
    reserved: player.populationReserved,
    pendingRelease: player.pendingPopulationRelease.reduce((sum, release) => sum + release.amount, 0),
    free: Math.max(0, Math.floor(player.populationCurrent - used)),
    capacity,
    perMinute: getPopulationPerMinute(player),
  };
};

export const getProductionRates = (player: MatchPlayerState, finalBattle: boolean): ResourceAmounts => {
  const rates = zeroResources();
  for (const building of player.buildings) {
    if (building.status !== "active") continue;
    const production = getBuildingLevelConfig(building).productionPerMinute;
    if (!production) continue;
    for (const kind of RESOURCE_KINDS) rates[kind] += production[kind] ?? 0;
  }
  for (const kind of RESOURCE_KINDS) {
    rates[kind] *= getResearchMultiplier(player, PRODUCTION_RESEARCH[kind]);
    if (finalBattle) rates[kind] *= MATCH_CONFIG.finalBattle.productionMultiplier;
  }
  return rates;
};

export const getResourceViews = (player: MatchPlayerState, finalBattle: boolean): ResourceViews => {
  const capacity = getStorageCapacity(player);
  const rates = getProductionRates(player, finalBattle);
  return {
    wood: { amount: round(player.resources.wood), capacity, perMinute: round(rates.wood), capped: player.resources.wood >= capacity },
    stone: { amount: round(player.resources.stone), capacity, perMinute: round(rates.stone), capped: player.resources.stone >= capacity },
    gold: { amount: round(player.resources.gold), capacity, perMinute: round(rates.gold), capped: player.resources.gold >= capacity },
    iron: { amount: round(player.resources.iron), capacity, perMinute: round(rates.iron), capped: player.resources.iron >= capacity },
    food: { amount: round(player.resources.food), capacity, perMinute: round(rates.food), capped: player.resources.food >= capacity },
  };
};

export const getUnitMaxHp = (player: MatchPlayerState, unitType: UnitType): number => {
  const healthMultiplier = unitType === "cavalry" ? getResearchMultiplier(player, "cavalryHealth") : 1;
  return UNIT_CONFIG[unitType].maxHp * healthMultiplier;
};

export const getSquadMaxHp = (player: MatchPlayerState, squad: InternalSquadState): number =>
  UNIT_TYPES.reduce((sum, unitType) => sum + squad.composition[unitType] * getUnitMaxHp(player, unitType), 0);

export const refreshSquadDerivedStats = (player: MatchPlayerState, squad: InternalSquadState): void => {
  squad.hp = round(UNIT_TYPES.reduce((sum, unitType) => sum + squad.unitHealth[unitType], 0));
  squad.maxHp = round(getSquadMaxHp(player, squad));
  squad.power = round(
    UNIT_TYPES.reduce(
      (sum, unitType) =>
        sum + squad.composition[unitType] * (UNIT_CONFIG[unitType].damage * 2 + getUnitMaxHp(player, unitType) * 0.16),
      0,
    ),
  );
};

const progressBuilding = (building: InternalBuildingState, now: number): void => {
  if (building.startedAt === null || building.completesAt === null) return;
  const duration = building.completesAt - building.startedAt;
  building.progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - building.startedAt) / duration));
};

const finishBuilding = (
  player: MatchPlayerState,
  building: InternalBuildingState,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
): void => {
  const wasUpgrade = building.status === "upgrading";
  if (wasUpgrade && building.pendingLevel !== null) building.level = building.pendingLevel;
  const levelConfig = getBuildingLevelConfig(building);
  const hpRatio = building.maxHp > 0 ? building.hp / building.maxHp : 1;
  const effectiveMaxHp = levelConfig.maxHp * (finalBattle ? MATCH_CONFIG.finalBattle.buildingHpMultiplier : 1);
  building.maxHp = effectiveMaxHp;
  building.hp = wasUpgrade ? Math.max(building.hp, effectiveMaxHp * hpRatio) : effectiveMaxHp;
  building.status = "active";
  building.progress = 1;
  building.startedAt = null;
  building.completesAt = null;
  building.pendingLevel = null;
  if (!wasUpgrade) player.stats.buildingsConstructed += 1;
  emit({
    type: wasUpgrade ? "buildingUpgraded" : "buildingCompleted",
    serverTime: now,
    message: wasUpgrade ? `${BUILDING_CONFIG[building.type].label} улучшено` : `${BUILDING_CONFIG[building.type].label} построено`,
    playerId: player.playerId,
    entityIds: [building.id],
    position: { ...building.position },
  });
};

const tickBuildings = (player: MatchPlayerState, now: number, finalBattle: boolean, emit: GameEventSink): void => {
  for (const building of player.buildings) {
    if (building.status !== "constructing" && building.status !== "upgrading") continue;
    progressBuilding(building, now);
    if (building.completesAt !== null && now >= building.completesAt) finishBuilding(player, building, now, finalBattle, emit);
  }
};

const tickResources = (
  player: MatchPlayerState,
  deltaMs: number,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
): void => {
  const rates = getProductionRates(player, finalBattle);
  const capacity = getStorageCapacity(player);
  for (const kind of RESOURCE_KINDS) {
    const before = player.resources[kind];
    const produced = (rates[kind] * deltaMs) / 60_000;
    player.resources[kind] = Math.min(capacity, before + produced);
    player.stats.resourcesGathered[kind] += player.resources[kind] - before;
    if (player.resources[kind] >= capacity && rates[kind] > 0) {
      if (!player.cappedResources.has(kind)) {
        player.cappedResources.add(kind);
        emit({
          type: "resourceCapped",
          serverTime: now,
          message: `Склад заполнен: ${kind}`,
          playerId: player.playerId,
          resource: kind,
        });
      }
    } else {
      player.cappedResources.delete(kind);
    }
  }
};

const tickPopulation = (player: MatchPlayerState, deltaMs: number, now: number): void => {
  player.pendingPopulationRelease = player.pendingPopulationRelease.filter((release) => release.releasesAt > now);
  const capacity = getPopulationCapacity(player);
  const rate = getPopulationPerMinute(player);
  const growth = player.populationGrowthFraction + (rate * deltaMs) / 60_000;
  const whole = Math.floor(growth);
  player.populationGrowthFraction = growth - whole;
  if (whole > 0) player.populationCurrent = Math.min(capacity, player.populationCurrent + whole);
  if (player.populationCurrent > capacity) player.populationCurrent = capacity;
};

const tickTraining = (player: MatchPlayerState, now: number, emit: GameEventSink): void => {
  for (const order of [...player.trainingQueue]) {
    const trainingBuilding = player.buildings.find((building) => building.id === order.buildingId);
    if (!trainingBuilding || trainingBuilding.status === "destroyed") {
      player.populationReserved = Math.max(0, player.populationReserved - order.reservedPopulation);
      player.trainingQueue = player.trainingQueue.filter((candidate) => candidate.id !== order.id);
      continue;
    }
    const cycleStartedAt = order.nextCompletionAt - order.trainingMs;
    order.progress = Math.max(0, Math.min(1, (now - cycleStartedAt) / order.trainingMs));
    while (order.remaining > 0 && now >= order.nextCompletionAt) {
      order.remaining -= 1;
      order.completed += 1;
      order.reservedPopulation -= order.populationPerUnit;
      player.populationReserved -= order.populationPerUnit;
      player.garrison[order.unitType] += 1;
      player.stats.unitsTrained += 1;
      emit({
        type: "unitTrained",
        serverTime: order.nextCompletionAt,
        message: `${UNIT_CONFIG[order.unitType].label} обучен`,
        playerId: player.playerId,
        entityIds: [order.id, order.buildingId],
        unitType: order.unitType,
      });
      order.nextCompletionAt += order.trainingMs;
      order.progress = 0;
    }
    if (order.remaining === 0) player.trainingQueue = player.trainingQueue.filter((candidate) => candidate.id !== order.id);
  }
};

const tickResearch = (player: MatchPlayerState, now: number, emit: GameEventSink): void => {
  const order = player.activeResearch;
  if (!order) return;
  const duration = order.completesAt - order.startedAt;
  order.progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - order.startedAt) / duration));
  if (now < order.completesAt) return;
  player.researchLevels[order.type] = order.targetLevel;
  player.activeResearch = null;
  player.stats.researchCompleted += 1;
  emit({
    type: "researchCompleted",
    serverTime: now,
    message: `${RESEARCH_CONFIG[order.type].label}: уровень ${order.targetLevel}`,
    playerId: player.playerId,
    entityIds: [order.id],
  });
};

const tickHealing = (player: MatchPlayerState, deltaMs: number, now: number, emit: GameEventSink): void => {
  const hospital = player.buildings.find((building) => building.type === "hospital" && building.status === "active");
  if (!hospital) return;
  const baseHealing = getBuildingLevelConfig(hospital).healingPerMinute ?? 0;
  const healing = (baseHealing * getResearchMultiplier(player, "healingSpeed") * deltaMs) / 60_000;
  const healingSquads = player.squads.filter((squad) => squad.status === "healing");
  if (healingSquads.length === 0) return;
  const each = healing / healingSquads.length;
  for (const squad of healingSquads) {
    let remaining = each;
    for (const unitType of UNIT_TYPES) {
      const maximum = squad.composition[unitType] * getUnitMaxHp(player, unitType);
      const missing = Math.max(0, maximum - squad.unitHealth[unitType]);
      const restored = Math.min(missing, remaining);
      squad.unitHealth[unitType] += restored;
      remaining -= restored;
      if (remaining <= 0) break;
    }
    refreshSquadDerivedStats(player, squad);
    if (squad.hp >= squad.maxHp - 0.01) {
      squad.status = "idle";
      squad.healingStartedAt = null;
      emit({
        type: "healingCompleted",
        serverTime: now,
        message: `${squad.name} полностью восстановлен`,
        playerId: player.playerId,
        entityIds: [squad.id, hospital.id],
        position: { ...squad.position },
      });
    }
  }
};

export const tickPlayerEconomy = (
  player: MatchPlayerState,
  deltaMs: number,
  now: number,
  finalBattle: boolean,
  emit: GameEventSink,
): void => {
  tickBuildings(player, now, finalBattle, emit);
  tickResources(player, deltaMs, now, finalBattle, emit);
  tickPopulation(player, deltaMs, now);
  tickTraining(player, now, emit);
  tickResearch(player, now, emit);
  tickHealing(player, deltaMs, now, emit);
};

export const applyLastBattleTrainingBoost = (player: MatchPlayerState, now: number): void => {
  const multiplier = MATCH_CONFIG.finalBattle.trainingTimeMultiplier;
  for (const order of player.trainingQueue) {
    const remainingUntilCompletion = Math.max(0, order.nextCompletionAt - now);
    order.nextCompletionAt = now + Math.round(remainingUntilCompletion * multiplier);
    order.trainingMs = Math.max(400, Math.round(order.trainingMs * multiplier));
  }
};

export const cloneStats = (stats: MatchStats): MatchStats => ({
  ...stats,
  resourcesGathered: {
    wood: round(stats.resourcesGathered.wood),
    stone: round(stats.resourcesGathered.stone),
    gold: round(stats.resourcesGathered.gold),
    iron: round(stats.resourcesGathered.iron),
    food: round(stats.resourcesGathered.food),
  },
});
