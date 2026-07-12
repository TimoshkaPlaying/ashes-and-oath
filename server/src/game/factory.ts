import {
  BUILDING_CONFIG,
  MATCH_CONFIG,
  RESOURCE_KINDS,
  UNIT_TYPES,
  type KingdomCustomization,
  type MatchStats,
  type ResourceAmounts,
  type UnitCounts,
} from "@ashes/shared";
import type { InternalBuildingState, MatchPlayerState, MatchState, RoomPlayer } from "./model.js";
import { cloneResources, randomId, zeroResources, zeroUnits } from "./math.js";

export const DEFAULT_CUSTOMIZATION: KingdomCustomization = {
  kingdomName: "Безымянное королевство",
  color: "#c99a52",
  flag: "lion",
  emblem: "sun",
};

export const createStats = (): MatchStats => ({
  resourcesGathered: zeroResources(),
  buildingsConstructed: 0,
  unitsTrained: 0,
  unitsLost: 0,
  unitsKilled: 0,
  damageDealt: 0,
  damageTaken: 0,
  buildingsDestroyed: 0,
  squadsCreated: 0,
  researchCompleted: 0,
});

export const createRoomPlayer = (
  playerId: string,
  socketId: string,
  reconnectToken: string,
  displayName: string,
  host: boolean,
  now: number,
): RoomPlayer => ({
  playerId,
  socketId,
  reconnectToken,
  displayName,
  customization: {
    ...DEFAULT_CUSTOMIZATION,
    kingdomName: host ? "Королевство пепла" : "Королевство зари",
    color: host ? "#d18b47" : "#4f83c5",
  },
  ready: false,
  connected: true,
  reconnectDeadline: null,
  joinedAt: now,
  lastCommandSeq: 0,
  commandHistory: new Map(),
});

const createTownHall = (ownerId: string, baseIndex: 0 | 1): InternalBuildingState => {
  const level = BUILDING_CONFIG.townHall.levels[0];
  if (!level) throw new Error("Town hall level 1 configuration is missing");
  return {
    id: randomId("building"),
    ownerId,
    type: "townHall",
    level: 1,
    status: "active",
    hp: level.maxHp,
    maxHp: level.maxHp,
    progress: 1,
    position: { ...MATCH_CONFIG.basePositions[baseIndex] },
    startedAt: null,
    completesAt: null,
    gateOpen: null,
    pendingLevel: null,
    lastTowerAttackAt: 0,
  };
};

export const createMatchPlayer = (playerId: string, baseIndex: 0 | 1): MatchPlayerState => ({
  playerId,
  resources: cloneResources(MATCH_CONFIG.startingResources),
  resourceFractions: zeroResources(),
  populationCurrent: MATCH_CONFIG.startingPopulation,
  populationGrowthFraction: 0,
  populationReserved: 0,
  pendingPopulationRelease: [],
  buildings: [createTownHall(playerId, baseIndex)],
  garrison: zeroUnits(),
  squads: [],
  trainingQueue: [],
  researchLevels: {},
  activeResearch: null,
  stats: createStats(),
  cappedResources: new Set(),
  baseIndex,
});

export const createMatch = (players: readonly RoomPlayer[], now: number): MatchState => {
  const matchPlayers = new Map<string, MatchPlayerState>();
  players.forEach((player, index) => {
    matchPlayers.set(player.playerId, createMatchPlayer(player.playerId, index as 0 | 1));
    player.lastCommandSeq = 0;
    player.commandHistory.clear();
  });

  return {
    matchId: randomId("match"),
    startedAt: now,
    truceEndsAt: now + MATCH_CONFIG.truceMs,
    lastBattleStartsAt: now + MATCH_CONFIG.lastBattleAtMs,
    hardEndsAt: now + MATCH_CONFIG.hardLimitMs,
    phase: "truce",
    winnerId: null,
    finishReason: null,
    lastTickAt: now,
    truceWarningSent: false,
    finalBattleApplied: false,
    players: matchPlayers,
    rematchVotes: new Set(),
  };
};

export const resetUnitCounts = (target: UnitCounts): void => {
  for (const type of UNIT_TYPES) target[type] = 0;
};

export const resetResourceAmounts = (target: ResourceAmounts): void => {
  for (const type of RESOURCE_KINDS) target[type] = 0;
};
