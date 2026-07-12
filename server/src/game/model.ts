import type {
  BuildingPublicState,
  FinishReason,
  GameCommandResult,
  GameEvent,
  KingdomCustomization,
  MatchPhase,
  MatchStats,
  ResearchOrderView,
  ResearchType,
  ResourceAmounts,
  ResourceKind,
  SquadPublicState,
  TrainingQueueItem,
  UnitCounts,
  UnitType,
} from "@ashes/shared";

export interface RoomPlayer {
  playerId: string;
  socketId: string | null;
  reconnectToken: string;
  displayName: string;
  customization: KingdomCustomization;
  ready: boolean;
  connected: boolean;
  reconnectDeadline: number | null;
  joinedAt: number;
  lastCommandSeq: number;
  commandHistory: Map<string, GameCommandResult>;
}

export interface InternalBuildingState extends BuildingPublicState {
  pendingLevel: number | null;
  lastTowerAttackAt: number;
}

export interface InternalTrainingOrder extends TrainingQueueItem {
  unitCost: ResourceAmounts;
  populationPerUnit: number;
}

export interface InternalSquadState extends SquadPublicState {
  attackReadyAt: Record<UnitType, number>;
  healingStartedAt: number | null;
}

export interface InternalResearchOrder extends ResearchOrderView {
  cost: ResourceAmounts;
}

export interface PendingPopulationRelease {
  amount: number;
  releasesAt: number;
}

export interface MatchPlayerState {
  playerId: string;
  resources: ResourceAmounts;
  resourceFractions: ResourceAmounts;
  populationCurrent: number;
  populationGrowthFraction: number;
  populationReserved: number;
  pendingPopulationRelease: PendingPopulationRelease[];
  buildings: InternalBuildingState[];
  garrison: UnitCounts;
  squads: InternalSquadState[];
  trainingQueue: InternalTrainingOrder[];
  researchLevels: Partial<Record<ResearchType, number>>;
  activeResearch: InternalResearchOrder | null;
  stats: MatchStats;
  cappedResources: Set<ResourceKind>;
  baseIndex: 0 | 1;
}

export interface MatchState {
  matchId: string;
  startedAt: number;
  truceEndsAt: number;
  lastBattleStartsAt: number;
  hardEndsAt: number;
  phase: MatchPhase;
  winnerId: string | null;
  finishReason: FinishReason | null;
  lastTickAt: number;
  truceWarningSent: boolean;
  finalBattleApplied: boolean;
  players: Map<string, MatchPlayerState>;
  rematchVotes: Set<string>;
}

export interface RoomEventEnvelope {
  roomCode: string;
  event: GameEvent;
}

export type GameEventInput = Omit<GameEvent, "id">;
export type GameEventSink = (event: GameEventInput) => void;
