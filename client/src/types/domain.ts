export type Screen = 'menu' | 'lobby' | 'game' | 'results';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export type Quality = 'low' | 'medium' | 'high';

export interface GameSettings {
  version: 1;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  quality: Quality;
  showFps: boolean;
}

export type ResourceKey = 'wood' | 'stone' | 'gold' | 'iron' | 'food';

export interface ResourceView {
  amount: number;
  capacity: number;
  perMinute: number;
}

export interface PlayerView {
  id: string;
  name: string;
  kingdomName: string;
  color: string;
  flag: string;
  crest: string;
  ready: boolean;
  connected: boolean;
  population: number;
  populationCap: number;
  townHallLevel: number;
}

export interface LobbyView {
  roomCode: string;
  roomName: string;
  visibility: 'public' | 'private';
  createdAt: number;
  passwordRequired: boolean;
  maxPlayers: number;
  selfId: string;
  hostId: string;
  players: PlayerView[];
}

export interface PublicRoomView {
  code: string;
  name: string;
  ownerName: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'playing' | 'full' | 'unavailable';
  createdAt: number;
  joinable: boolean;
  passwordRequired: boolean;
}

export interface RoomCreationOptions {
  roomName: string;
  visibility: 'public' | 'private';
  maxPlayers: 2;
  password?: string;
}

export type GamePhase = 'truce' | 'battle' | 'lastBattle' | 'finished';
export type UnitType = 'infantry' | 'archer' | 'cavalry' | 'catapult';
export type Formation = 'line' | 'defensive' | 'wedge' | 'loose' | 'protectSiege';
export type Behavior = 'aggressive' | 'defensive' | 'holdPosition' | 'avoidCombat' | 'buildingsOnly' | 'nearestEnemy';

export type SquadStatus =
  | 'forming'
  | 'idle'
  | 'moving'
  | 'fighting'
  | 'attackingBuilding'
  | 'retreating'
  | 'returning'
  | 'healing'
  | 'destroyed';

export interface UnitCounts {
  infantry: number;
  archer: number;
  cavalry: number;
  catapult: number;
}

export interface SquadView {
  id: string;
  ownerId: string;
  name: string;
  index: number;
  units: UnitCounts;
  hp: number;
  maxHp: number;
  power: number;
  speed: number;
  formation: Formation;
  behavior: Behavior;
  status: SquadStatus;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  etaSeconds?: number;
  visible: boolean;
}

export type BuildingType =
  | 'townHall'
  | 'sawmill'
  | 'quarry'
  | 'goldMine'
  | 'ironMine'
  | 'farm'
  | 'house'
  | 'warehouse'
  | 'market'
  | 'hospital'
  | 'barracks'
  | 'archeryRange'
  | 'stable'
  | 'siegeWorkshop'
  | 'forge'
  | 'wall'
  | 'gate'
  | 'tower';

export interface BuildingView {
  id: string;
  ownerId: string;
  type: BuildingType;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  state: 'building' | 'active' | 'upgrading' | 'destroyed';
  progress?: number;
  gateOpen?: boolean | null;
  visible: boolean;
}

export type QueueKind = 'building' | 'training' | 'research';

export interface QueueItemView {
  id: string;
  kind: QueueKind;
  label: string;
  progress: number;
  secondsLeft: number;
  icon?: string;
}

export interface EventView {
  id: string;
  at: number;
  type: 'info' | 'success' | 'warning' | 'danger' | 'scout';
  message: string;
}

export interface MatchStatsView {
  durationSeconds: number;
  resourcesGathered: number;
  buildingsBuilt: number;
  unitsTrained: number;
  unitsLost: number;
  unitsKilled: number;
  damageDealt: number;
  buildingsDestroyed: number;
  squadsCreated: number;
  researchCompleted: number;
}

export interface GameView {
  roomCode: string;
  selfId: string;
  phase: GamePhase;
  serverTime: number;
  truceEndsAt: number;
  matchEndsAt: number;
  lastBattleEndsAt?: number;
  self: PlayerView;
  opponent: PlayerView;
  resources: Record<ResourceKey, ResourceView>;
  reserveUnits: UnitCounts;
  buildings: BuildingView[];
  squads: SquadView[];
  queues: QueueItemView[];
  events: EventView[];
  winnerId?: string;
  stats?: MatchStatsView;
}

export interface ToastMessage {
  id: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  title: string;
  detail?: string;
}

export interface LobbyCustomization {
  kingdomName: string;
  color: string;
  flag: string;
  crest: string;
}

export interface CommandEnvelope {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface NetworkState {
  connection: ConnectionState;
  ping: number | null;
  screen: Screen;
  lobby: LobbyView | null;
  game: GameView | null;
  resumeSeconds: number | null;
  toasts: ToastMessage[];
  publicRooms: PublicRoomView[];
  roomActionPending: boolean;
}

export const EMPTY_UNITS: UnitCounts = {
  infantry: 0,
  archer: 0,
  cavalry: 0,
  catapult: 0,
};
