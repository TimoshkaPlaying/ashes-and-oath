export const RESOURCE_KINDS = ["wood", "stone", "gold", "iron", "food"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const BUILDING_TYPES = [
  "townHall",
  "sawmill",
  "quarry",
  "goldMine",
  "ironMine",
  "farm",
  "house",
  "warehouse",
  "market",
  "hospital",
  "barracks",
  "archeryRange",
  "stable",
  "siegeWorkshop",
  "forge",
  "wall",
  "gate",
  "tower",
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export const UNIT_TYPES = ["infantry", "archer", "cavalry", "catapult"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const FORMATIONS = ["line", "defensive", "wedge", "loose", "protectSiege"] as const;
export type Formation = (typeof FORMATIONS)[number];

export const BEHAVIORS = [
  "aggressive",
  "defensive",
  "holdPosition",
  "avoidCombat",
  "buildingsOnly",
  "nearestEnemy",
] as const;
export type SquadBehavior = (typeof BEHAVIORS)[number];

export const SQUAD_STATUSES = [
  "forming",
  "idle",
  "moving",
  "fighting",
  "attackingBuilding",
  "retreating",
  "returning",
  "healing",
  "destroyed",
] as const;
export type SquadStatus = (typeof SQUAD_STATUSES)[number];

export const RESEARCH_TYPES = [
  "infantryDamage",
  "armor",
  "arrowDamage",
  "archerRange",
  "cavalryHealth",
  "cavalrySpeed",
  "squadSpeed",
  "catapultDamage",
  "buildingDamage",
  "trainingSpeed",
  "woodProduction",
  "stoneProduction",
  "goldProduction",
  "ironProduction",
  "foodProduction",
  "storageCapacity",
  "populationCapacity",
  "healingSpeed",
] as const;
export type ResearchType = (typeof RESEARCH_TYPES)[number];

export interface Point {
  x: number;
  y: number;
}

export type ResourceAmounts = Record<ResourceKind, number>;
export type UnitCounts = Record<UnitType, number>;

export interface ResourceView {
  amount: number;
  capacity: number;
  perMinute: number;
  capped: boolean;
}

export type ResourceViews = Record<ResourceKind, ResourceView>;

export interface PopulationView {
  current: number;
  used: number;
  reserved: number;
  pendingRelease: number;
  free: number;
  capacity: number;
  perMinute: number;
}

export interface KingdomCustomization {
  kingdomName: string;
  color: string;
  flag: string;
  emblem: string;
}

export interface LobbyPlayer {
  playerId: string;
  displayName: string;
  customization: KingdomCustomization;
  ready: boolean;
  connected: boolean;
  reconnectDeadline: number | null;
  host: boolean;
}

export type RoomStatus = "lobby" | "playing" | "finished";

export interface LobbyState {
  code: string;
  status: RoomStatus;
  players: LobbyPlayer[];
  maxPlayers: 2;
  canStart: boolean;
  serverTime: number;
}

export interface RoomCreateRequest {
  displayName: string;
}

export interface RoomJoinRequest {
  code: string;
  displayName: string;
}

export interface RoomResumeRequest {
  code: string;
  reconnectToken: string;
}

export interface LobbyUpdateRequest {
  customization: Partial<KingdomCustomization>;
}

export interface LobbyReadyRequest {
  ready: boolean;
}

export interface RoomJoined {
  code: string;
  playerId: string;
  reconnectToken: string;
  resumed: boolean;
  lobby: LobbyState;
}

export const ROOM_ERROR_CODES = [
  "INVALID_REQUEST",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_ALREADY_STARTED",
  "INVALID_RECONNECT_TOKEN",
  "PLAYER_NOT_IN_ROOM",
  "NAME_TAKEN",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

export interface RoomError {
  code: RoomErrorCode;
  message: string;
}

export type BuildingStatus = "constructing" | "active" | "upgrading" | "destroyed";

export interface TrainingQueueItem {
  id: string;
  buildingId: string;
  unitType: UnitType;
  total: number;
  completed: number;
  remaining: number;
  nextCompletionAt: number;
  startedAt: number;
  trainingMs: number;
  progress: number;
  reservedPopulation: number;
  spent: ResourceAmounts;
}

export interface BuildingPublicState {
  id: string;
  ownerId: string;
  type: BuildingType;
  level: number;
  status: BuildingStatus;
  hp: number;
  maxHp: number;
  progress: number;
  position: Point;
  startedAt: number | null;
  completesAt: number | null;
  gateOpen: boolean | null;
}

export type SquadTarget =
  | { kind: "position"; position: Point }
  | { kind: "enemySquad"; squadId: string }
  | { kind: "enemyBuilding"; buildingId: string }
  | { kind: "enemyBase" }
  | { kind: "defendBase" }
  | { kind: "home" };

export interface SquadPublicState {
  id: string;
  ownerId: string;
  number: number;
  name: string;
  composition: UnitCounts;
  unitHealth: UnitCounts;
  formation: Formation;
  behavior: SquadBehavior;
  status: SquadStatus;
  target: SquadTarget | null;
  position: Point;
  route: Point[];
  hp: number;
  maxHp: number;
  power: number;
  speed: number;
  etaMs: number | null;
  lastCombatAt: number | null;
}

export interface ResearchOrderView {
  id: string;
  type: ResearchType;
  targetLevel: number;
  startedAt: number;
  completesAt: number;
  progress: number;
}

export interface MatchStats {
  resourcesGathered: ResourceAmounts;
  buildingsConstructed: number;
  unitsTrained: number;
  unitsLost: number;
  unitsKilled: number;
  damageDealt: number;
  damageTaken: number;
  buildingsDestroyed: number;
  squadsCreated: number;
  researchCompleted: number;
}

export interface PlayerPublicState {
  playerId: string;
  displayName: string;
  customization: KingdomCustomization;
  connected: boolean;
  reconnectDeadline: number | null;
  resources: ResourceViews;
  population: PopulationView;
  townHallLevel: number;
  buildings: BuildingPublicState[];
  garrison: UnitCounts;
  squads: SquadPublicState[];
  trainingQueue: TrainingQueueItem[];
  researchLevels: Partial<Record<ResearchType, number>>;
  activeResearch: ResearchOrderView | null;
  stats: MatchStats;
  nextCommandSeq: number;
}

export interface OpponentSummary {
  playerId: string;
  displayName: string;
  customization: KingdomCustomization;
  connected: boolean;
  reconnectDeadline: number | null;
}

export type MatchPhase = "truce" | "battle" | "lastBattle" | "finished";

export interface ArenaView {
  width: number;
  height: number;
  ownBase: Point;
  enemyBase: Point | null;
  roads: Point[][];
  riverX: number;
  bridgeY: number;
  visionRadius: number;
}

export interface GameSnapshot {
  roomCode: string;
  matchId: string;
  playerId: string;
  serverTime: number;
  startedAt: number;
  phase: MatchPhase;
  truceEndsAt: number;
  lastBattleStartsAt: number;
  hardEndsAt: number;
  phaseEndsAt: number | null;
  self: PlayerPublicState;
  opponent: OpponentSummary | null;
  visibleEnemyBuildings: BuildingPublicState[];
  visibleEnemySquads: SquadPublicState[];
  arena: ArenaView;
  winnerId: string | null;
  finishReason: FinishReason | null;
  rematchVotes: string[];
}

export type FinishReason = "townHallDestroyed" | "disconnectTimeout" | "timeLimit" | "opponentLeft";

export const GAME_COMMAND_TYPES = [
  "building:construct",
  "building:upgrade",
  "training:queue",
  "training:cancel",
  "market:trade",
  "research:start",
  "squad:create",
  "squad:move",
  "squad:target",
  "squad:stop",
  "squad:retreat",
  "squad:merge",
  "squad:split",
  "squad:hospitalize",
  "gate:set",
] as const;
export type GameCommandType = (typeof GAME_COMMAND_TYPES)[number];

interface CommandBase<TType extends GameCommandType, TPayload> {
  id: string;
  seq: number;
  type: TType;
  payload: TPayload;
}

export type GameCommand =
  | CommandBase<"building:construct", { buildingType: BuildingType; position?: Point }>
  | CommandBase<"building:upgrade", { buildingId: string }>
  | CommandBase<"training:queue", { buildingId: string; unitType: UnitType; count: number }>
  | CommandBase<"training:cancel", { queueId: string }>
  | CommandBase<"market:trade", { sell: ResourceKind; buy: ResourceKind; amount: number }>
  | CommandBase<"research:start", { researchType: ResearchType }>
  | CommandBase<
      "squad:create",
      {
        name: string;
        composition: UnitCounts;
        formation: Formation;
        behavior: SquadBehavior;
      }
    >
  | CommandBase<"squad:move", { squadId: string; destination: Point; route?: Point[] }>
  | CommandBase<"squad:target", { squadId: string; target: SquadTarget }>
  | CommandBase<"squad:stop", { squadId: string }>
  | CommandBase<"squad:retreat", { squadId: string }>
  | CommandBase<"squad:merge", { sourceSquadId: string; targetSquadId: string }>
  | CommandBase<
      "squad:split",
      {
        squadId: string;
        name: string;
        composition: UnitCounts;
        formation: Formation;
        behavior: SquadBehavior;
      }
    >
  | CommandBase<"squad:hospitalize", { squadId: string }>
  | CommandBase<"gate:set", { buildingId: string; open: boolean }>;

export const GAME_ERROR_CODES = [
  "INVALID_COMMAND",
  "DUPLICATE_COMMAND",
  "OUT_OF_SEQUENCE",
  "NOT_IN_MATCH",
  "MATCH_FINISHED",
  "RATE_LIMITED",
  "NOT_FOUND",
  "NOT_OWNER",
  "LOCKED",
  "INSUFFICIENT_RESOURCES",
  "INSUFFICIENT_POPULATION",
  "STORAGE_FULL",
  "QUEUE_FULL",
  "SQUAD_LIMIT",
  "INVALID_COMPOSITION",
  "INVALID_TARGET",
  "TRUCE_ACTIVE",
  "TOO_FAR",
  "BUSY",
] as const;
export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

export interface CommandError {
  code: GameErrorCode;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface GameCommandResult {
  id: string;
  seq: number;
  ok: boolean;
  serverTime: number;
  error: CommandError | null;
}

export const GAME_EVENT_TYPES = [
  "matchStarted",
  "truceEnding",
  "truceEnded",
  "lastBattleStarted",
  "resourceCapped",
  "buildingCompleted",
  "buildingUpgraded",
  "buildingDamaged",
  "buildingDestroyed",
  "unitTrained",
  "researchCompleted",
  "squadCreated",
  "squadMoved",
  "combatHit",
  "unitKilled",
  "squadDestroyed",
  "healingStarted",
  "healingCompleted",
  "playerDisconnected",
  "playerReconnected",
  "matchFinished",
  "rematchStarted",
] as const;
export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

export interface GameEvent {
  id: string;
  type: GameEventType;
  serverTime: number;
  message: string;
  playerId?: string;
  entityIds?: string[];
  position?: Point;
  amount?: number;
  resource?: ResourceKind;
  unitType?: UnitType;
}

export interface ConnectionStatusEvent {
  playerId: string;
  connected: boolean;
  reconnectDeadline: number | null;
  message: string;
}

export interface HealthResponse {
  status: "ok";
  service: "ashes-server";
  uptime: number;
  rooms: number;
  players: number;
  timestamp: number;
}

export interface InterServerEvents {}
export interface SocketData {
  roomCode?: string;
  playerId?: string;
  reconnectToken?: string;
}

export interface ClientToServerEvents {
  "room:create": (payload: RoomCreateRequest, ack?: (response: RoomJoined | RoomError) => void) => void;
  "room:join": (payload: RoomJoinRequest, ack?: (response: RoomJoined | RoomError) => void) => void;
  "room:resume": (payload: RoomResumeRequest, ack?: (response: RoomJoined | RoomError) => void) => void;
  "room:leave": () => void;
  "lobby:update": (payload: LobbyUpdateRequest) => void;
  "lobby:ready": (payload: LobbyReadyRequest) => void;
  "game:command": (command: GameCommand) => void;
  "game:rematch": (payload: { want: boolean }) => void;
  "ping:request": (payload: { clientTime: number }) => void;
}

export interface ServerToClientEvents {
  "room:joined": (payload: RoomJoined) => void;
  "room:error": (payload: RoomError) => void;
  "lobby:state": (payload: LobbyState) => void;
  "game:snapshot": (payload: GameSnapshot) => void;
  "game:event": (payload: GameEvent) => void;
  "game:command-result": (payload: GameCommandResult) => void;
  "connection:status": (payload: ConnectionStatusEvent) => void;
  "ping:response": (payload: { clientTime: number; serverTime: number }) => void;
}
