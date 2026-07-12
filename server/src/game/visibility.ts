import {
  MATCH_CONFIG,
  UNIT_CONFIG,
  UNIT_TYPES,
  type ArenaView,
  type BuildingPublicState,
  type GameSnapshot,
  type OpponentSummary,
  type PlayerPublicState,
  type Point,
  type ResearchOrderView,
  type SquadPublicState,
  type TrainingQueueItem,
} from "@ashes/shared";
import {
  cloneStats,
  getPopulationView,
  getResourceViews,
  getTownHallLevel,
} from "./economy.js";
import type {
  InternalBuildingState,
  InternalSquadState,
  MatchPlayerState,
  MatchState,
  RoomPlayer,
} from "./model.js";
import { cloneResources, cloneUnits, distance, round } from "./math.js";

const publicBuilding = (building: InternalBuildingState): BuildingPublicState => ({
  id: building.id,
  ownerId: building.ownerId,
  type: building.type,
  level: building.level,
  status: building.status,
  hp: round(building.hp),
  maxHp: round(building.maxHp),
  progress: round(building.progress, 3),
  position: { ...building.position },
  startedAt: building.startedAt,
  completesAt: building.completesAt,
  gateOpen: building.gateOpen,
});

const publicSquad = (squad: InternalSquadState, enemyView: boolean): SquadPublicState => ({
  id: squad.id,
  ownerId: squad.ownerId,
  number: squad.number,
  name: squad.name,
  composition: cloneUnits(squad.composition),
  unitHealth: cloneUnits(squad.unitHealth),
  formation: squad.formation,
  behavior: squad.behavior,
  status: squad.status,
  target: enemyView ? null : squad.target ? structuredClone(squad.target) : null,
  position: { ...squad.position },
  route: enemyView ? [] : squad.route.map((point) => ({ ...point })),
  hp: round(squad.hp),
  maxHp: round(squad.maxHp),
  power: round(squad.power),
  speed: round(squad.speed),
  etaMs: enemyView ? null : squad.etaMs,
  lastCombatAt: squad.lastCombatAt,
});

const publicTraining = (order: MatchPlayerState["trainingQueue"][number]): TrainingQueueItem => ({
  id: order.id,
  buildingId: order.buildingId,
  unitType: order.unitType,
  total: order.total,
  completed: order.completed,
  remaining: order.remaining,
  nextCompletionAt: order.nextCompletionAt,
  startedAt: order.startedAt,
  trainingMs: order.trainingMs,
  progress: round(order.progress, 3),
  reservedPopulation: order.reservedPopulation,
  spent: cloneResources(order.spent),
});

const publicResearch = (order: MatchPlayerState["activeResearch"]): ResearchOrderView | null => {
  if (!order) return null;
  return {
    id: order.id,
    type: order.type,
    targetLevel: order.targetLevel,
    startedAt: order.startedAt,
    completesAt: order.completesAt,
    progress: round(order.progress, 3),
  };
};

const visionForSquad = (squad: InternalSquadState): number => {
  let radius: number = MATCH_CONFIG.defaultVisionRadius;
  for (const unitType of UNIT_TYPES) {
    if (squad.composition[unitType] > 0) radius = Math.max(radius, UNIT_CONFIG[unitType].vision);
  }
  return radius;
};

export const isPointVisible = (viewer: MatchPlayerState, point: Point, revealAll: boolean): boolean => {
  if (revealAll) return true;
  const base = MATCH_CONFIG.basePositions[viewer.baseIndex];
  if (distance(base, point) <= MATCH_CONFIG.baseVisionRadius) return true;
  for (const building of viewer.buildings) {
    if (building.status === "destroyed") continue;
    if (distance(building.position, point) <= 150) return true;
  }
  for (const squad of viewer.squads) {
    if (squad.status === "destroyed") continue;
    if (distance(squad.position, point) <= visionForSquad(squad)) return true;
  }
  return false;
};

const makeArena = (player: MatchPlayerState, phase: MatchState["phase"]): ArenaView => {
  const ownBase = MATCH_CONFIG.basePositions[player.baseIndex];
  const enemyIndex: 0 | 1 = player.baseIndex === 0 ? 1 : 0;
  const enemyBase = phase === "truce" ? null : MATCH_CONFIG.basePositions[enemyIndex];
  return {
    width: MATCH_CONFIG.arenaWidth,
    height: MATCH_CONFIG.arenaHeight,
    ownBase: { ...ownBase },
    enemyBase: enemyBase ? { ...enemyBase } : null,
    roads: [
      [
        { ...MATCH_CONFIG.basePositions[0] },
        { x: MATCH_CONFIG.riverX, y: MATCH_CONFIG.bridgeY },
        { ...MATCH_CONFIG.basePositions[1] },
      ],
    ],
    riverX: MATCH_CONFIG.riverX,
    bridgeY: MATCH_CONFIG.bridgeY,
    visionRadius: MATCH_CONFIG.defaultVisionRadius,
  };
};

const publicSelf = (
  matchPlayer: MatchPlayerState,
  roomPlayer: RoomPlayer,
  finalBattle: boolean,
): PlayerPublicState => ({
  playerId: roomPlayer.playerId,
  displayName: roomPlayer.displayName,
  customization: { ...roomPlayer.customization },
  connected: roomPlayer.connected,
  reconnectDeadline: roomPlayer.reconnectDeadline,
  resources: getResourceViews(matchPlayer, finalBattle),
  population: getPopulationView(matchPlayer),
  townHallLevel: getTownHallLevel(matchPlayer),
  buildings: matchPlayer.buildings.map(publicBuilding),
  garrison: cloneUnits(matchPlayer.garrison),
  squads: matchPlayer.squads.map((squad) => publicSquad(squad, false)),
  trainingQueue: matchPlayer.trainingQueue.map(publicTraining),
  researchLevels: { ...matchPlayer.researchLevels },
  activeResearch: publicResearch(matchPlayer.activeResearch),
  stats: cloneStats(matchPlayer.stats),
  nextCommandSeq: roomPlayer.lastCommandSeq + 1,
});

const opponentSummary = (player: RoomPlayer): OpponentSummary => ({
  playerId: player.playerId,
  displayName: player.displayName,
  customization: { ...player.customization },
  connected: player.connected,
  reconnectDeadline: player.reconnectDeadline,
});

export const createSnapshot = (
  roomCode: string,
  match: MatchState,
  roomPlayers: readonly RoomPlayer[],
  viewerId: string,
  now: number,
): GameSnapshot => {
  const viewer = match.players.get(viewerId);
  const viewerRoom = roomPlayers.find((player) => player.playerId === viewerId);
  const enemyRoom = roomPlayers.find((player) => player.playerId !== viewerId);
  const enemy = enemyRoom ? match.players.get(enemyRoom.playerId) : undefined;
  if (!viewer || !viewerRoom || !enemyRoom || !enemy) throw new Error("Cannot create a two-player snapshot");

  const hiddenByTruce = match.phase === "truce";
  const revealAll = match.phase === "lastBattle" || match.phase === "finished";
  const visibleBuildings = hiddenByTruce
    ? []
    : enemy.buildings
        .filter((building) => isPointVisible(viewer, building.position, revealAll))
        .map(publicBuilding);
  const visibleSquads = hiddenByTruce
    ? []
    : enemy.squads
        .filter((squad) => squad.status !== "destroyed" && isPointVisible(viewer, squad.position, revealAll))
        .map((squad) => publicSquad(squad, true));

  const phaseEndsAt =
    match.phase === "truce"
      ? match.truceEndsAt
      : match.phase === "battle"
        ? match.lastBattleStartsAt
        : match.phase === "lastBattle"
          ? match.hardEndsAt
          : null;

  return {
    roomCode,
    matchId: match.matchId,
    playerId: viewerId,
    serverTime: now,
    startedAt: match.startedAt,
    phase: match.phase,
    truceEndsAt: match.truceEndsAt,
    lastBattleStartsAt: match.lastBattleStartsAt,
    hardEndsAt: match.hardEndsAt,
    phaseEndsAt,
    self: publicSelf(viewer, viewerRoom, match.phase === "lastBattle"),
    opponent: hiddenByTruce ? null : opponentSummary(enemyRoom),
    visibleEnemyBuildings: visibleBuildings,
    visibleEnemySquads: visibleSquads,
    arena: makeArena(viewer, match.phase),
    winnerId: match.winnerId,
    finishReason: match.finishReason,
    rematchVotes: [...match.rematchVotes],
  };
};
