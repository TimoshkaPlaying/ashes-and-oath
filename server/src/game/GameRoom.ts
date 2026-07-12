import {
  MATCH_CONFIG,
  RESOURCE_KINDS,
  type ConnectionStatusEvent,
  type GameCommand,
  type GameCommandResult,
  type GameEvent,
  type GameSnapshot,
  type FinishReason,
  type KingdomCustomization,
  type LobbyState,
  type RoomStatus,
} from "@ashes/shared";
import { executeCommand } from "./commands.js";
import { applyLastBattleBuildingPenalty, tickCombat } from "./combat.js";
import { applyLastBattleTrainingBoost, tickPlayerEconomy } from "./economy.js";
import { createMatch, createRoomPlayer } from "./factory.js";
import type { GameEventInput, MatchPlayerState, MatchState, RoomPlayer } from "./model.js";
import { randomId } from "./math.js";
import { createSnapshot, isPointVisible } from "./visibility.js";
import { RoomActionError } from "../rooms/errors.js";

export interface AddPlayerResult {
  player: RoomPlayer;
  reconnectToken: string;
}

const GLOBAL_EVENT_TYPES = new Set<GameEvent["type"]>([
  "matchStarted",
  "truceEnding",
  "truceEnded",
  "lastBattleStarted",
  "playerDisconnected",
  "playerReconnected",
  "matchFinished",
  "rematchStarted",
]);

export class GameRoom {
  public readonly code: string;
  private readonly nowProvider: () => number;
  private readonly roomPlayers: RoomPlayer[] = [];
  private match: MatchState | null = null;
  private readonly events: GameEvent[] = [];
  private lastActivityAt: number;

  public constructor(code: string, nowProvider: () => number = Date.now) {
    this.code = code;
    this.nowProvider = nowProvider;
    this.lastActivityAt = nowProvider();
  }

  public get players(): readonly RoomPlayer[] {
    return this.roomPlayers;
  }

  public get status(): RoomStatus {
    if (!this.match) return "lobby";
    return this.match.phase === "finished" ? "finished" : "playing";
  }

  public get activityAt(): number {
    return this.lastActivityAt;
  }

  public getMatchState(): MatchState | null {
    return this.match;
  }

  public addPlayer(socketId: string, displayName: string, now = this.nowProvider()): AddPlayerResult {
    if (this.status !== "lobby") throw new RoomActionError("ROOM_ALREADY_STARTED", "Матч уже начался");
    if (this.roomPlayers.length >= 2) throw new RoomActionError("ROOM_FULL", "В комнате уже два игрока");
    const normalizedName = displayName.trim();
    if (this.roomPlayers.some((player) => player.displayName.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      throw new RoomActionError("NAME_TAKEN", "Это имя уже занято в комнате");
    }
    const playerId = randomId("player");
    const reconnectToken = randomId("resume");
    const player = createRoomPlayer(
      playerId,
      socketId,
      reconnectToken,
      normalizedName,
      this.roomPlayers.length === 0,
      now,
    );
    this.roomPlayers.push(player);
    this.lastActivityAt = now;
    return { player, reconnectToken };
  }

  public resumePlayer(reconnectToken: string, socketId: string, now = this.nowProvider()): RoomPlayer {
    const player = this.roomPlayers.find((candidate) => candidate.reconnectToken === reconnectToken);
    if (!player) throw new RoomActionError("INVALID_RECONNECT_TOKEN", "Недействительный ключ переподключения");
    if (!player.connected && (player.reconnectDeadline === null || now > player.reconnectDeadline)) {
      throw new RoomActionError("INVALID_RECONNECT_TOKEN", "Время переподключения истекло");
    }
    player.socketId = socketId;
    player.connected = true;
    player.reconnectDeadline = null;
    this.lastActivityAt = now;
    this.emitEvent({
      type: "playerReconnected",
      serverTime: now,
      message: `${player.displayName} вернулся в матч`,
      playerId: player.playerId,
    });
    return player;
  }

  public updateCustomization(
    playerId: string,
    update: Partial<KingdomCustomization>,
    now = this.nowProvider(),
  ): void {
    if (this.status !== "lobby") throw new RoomActionError("ROOM_ALREADY_STARTED", "Настройки нельзя менять после старта");
    const player = this.requirePlayer(playerId);
    player.customization = {
      kingdomName: update.kingdomName ?? player.customization.kingdomName,
      color: update.color ?? player.customization.color,
      flag: update.flag ?? player.customization.flag,
      emblem: update.emblem ?? player.customization.emblem,
    };
    player.ready = false;
    this.lastActivityAt = now;
  }

  public setReady(playerId: string, ready: boolean, now = this.nowProvider()): boolean {
    if (this.status !== "lobby") throw new RoomActionError("ROOM_ALREADY_STARTED", "Матч уже начался");
    const player = this.requirePlayer(playerId);
    player.ready = ready;
    this.lastActivityAt = now;
    if (
      this.roomPlayers.length === 2 &&
      this.roomPlayers.every((candidate) => candidate.ready && candidate.connected)
    ) {
      this.startMatch(now);
      return true;
    }
    return false;
  }

  public getLobbyState(now = this.nowProvider()): LobbyState {
    return {
      code: this.code,
      status: this.status,
      players: this.roomPlayers.map((player, index) => ({
        playerId: player.playerId,
        displayName: player.displayName,
        customization: { ...player.customization },
        ready: player.ready,
        connected: player.connected,
        reconnectDeadline: player.reconnectDeadline,
        host: index === 0,
      })),
      maxPlayers: 2,
      canStart:
        this.roomPlayers.length === 2 &&
        this.roomPlayers.every((player) => player.ready && player.connected),
      serverTime: now,
    };
  }

  public findPlayerBySocket(socketId: string): RoomPlayer | undefined {
    return this.roomPlayers.find((player) => player.socketId === socketId);
  }

  public findPlayerById(playerId: string): RoomPlayer | undefined {
    return this.roomPlayers.find((player) => player.playerId === playerId);
  }

  public disconnectSocket(socketId: string, now = this.nowProvider()): ConnectionStatusEvent | null {
    const player = this.findPlayerBySocket(socketId);
    if (!player) return null;
    player.socketId = null;
    player.connected = false;
    player.ready = false;
    player.reconnectDeadline = now + MATCH_CONFIG.reconnectMs;
    this.lastActivityAt = now;
    this.emitEvent({
      type: "playerDisconnected",
      serverTime: now,
      message: `${player.displayName} переподключается`,
      playerId: player.playerId,
    });
    return {
      playerId: player.playerId,
      connected: false,
      reconnectDeadline: player.reconnectDeadline,
      message: "Противник переподключается — ожидание до 60 секунд",
    };
  }

  public leaveSocket(socketId: string, now = this.nowProvider()): ConnectionStatusEvent | null {
    const player = this.findPlayerBySocket(socketId);
    if (!player) return null;
    if (this.match && this.match.phase !== "finished") {
      const opponent = this.roomPlayers.find((candidate) => candidate.playerId !== player.playerId);
      if (opponent) this.finishMatch(opponent.playerId, "opponentLeft", now);
    }
    player.socketId = null;
    player.connected = false;
    player.ready = false;
    player.reconnectDeadline = null;
    player.reconnectToken = randomId("left");
    if (!this.match) {
      const index = this.roomPlayers.indexOf(player);
      if (index >= 0) this.roomPlayers.splice(index, 1);
    }
    this.lastActivityAt = now;
    return {
      playerId: player.playerId,
      connected: false,
      reconnectDeadline: null,
      message: `${player.displayName} покинул комнату`,
    };
  }

  public connectionStatusFor(player: RoomPlayer): ConnectionStatusEvent {
    return {
      playerId: player.playerId,
      connected: player.connected,
      reconnectDeadline: player.reconnectDeadline,
      message: player.connected ? "Игрок подключён" : "Игрок переподключается",
    };
  }

  public handleCommand(playerId: string, command: GameCommand, now = this.nowProvider()): GameCommandResult {
    const roomPlayer = this.requirePlayer(playerId);
    const previous = roomPlayer.commandHistory.get(command.id);
    if (previous) return previous;

    if (command.seq !== roomPlayer.lastCommandSeq + 1) {
      return {
        id: command.id,
        seq: command.seq,
        ok: false,
        serverTime: now,
        error: {
          code: "OUT_OF_SEQUENCE",
          message: `Ожидалась команда ${roomPlayer.lastCommandSeq + 1}`,
          details: { expectedSeq: roomPlayer.lastCommandSeq + 1 },
        },
      };
    }

    roomPlayer.lastCommandSeq = command.seq;
    this.lastActivityAt = now;
    let result: GameCommandResult;
    if (!this.match) {
      result = {
        id: command.id,
        seq: command.seq,
        ok: false,
        serverTime: now,
        error: { code: "NOT_IN_MATCH", message: "Матч ещё не начался" },
      };
    } else if (this.match.phase === "finished") {
      result = {
        id: command.id,
        seq: command.seq,
        ok: false,
        serverTime: now,
        error: { code: "MATCH_FINISHED", message: "Матч уже завершён" },
      };
    } else {
      const player = this.match.players.get(playerId);
      const enemy = [...this.match.players.values()].find((candidate) => candidate.playerId !== playerId);
      if (!player || !enemy) {
        result = {
          id: command.id,
          seq: command.seq,
          ok: false,
          serverTime: now,
          error: { code: "NOT_IN_MATCH", message: "Игрок не найден в матче" },
        };
      } else {
        const commandError = executeCommand(command, {
          now,
          match: this.match,
          player,
          enemy,
          emit: (event) => this.emitEvent(event),
        });
        result = {
          id: command.id,
          seq: command.seq,
          ok: commandError === null,
          serverTime: now,
          error: commandError,
        };
      }
    }
    roomPlayer.commandHistory.set(command.id, result);
    while (roomPlayer.commandHistory.size > MATCH_CONFIG.commandHistorySize) {
      const oldest = roomPlayer.commandHistory.keys().next().value as string | undefined;
      if (!oldest) break;
      roomPlayer.commandHistory.delete(oldest);
    }
    return result;
  }

  public requestRematch(playerId: string, want: boolean, now = this.nowProvider()): boolean {
    const player = this.requirePlayer(playerId);
    if (!this.match || this.match.phase !== "finished") return false;
    if (want) this.match.rematchVotes.add(player.playerId);
    else this.match.rematchVotes.delete(player.playerId);
    if (this.roomPlayers.length === 2 && this.roomPlayers.every((candidate) => this.match?.rematchVotes.has(candidate.playerId))) {
      this.startMatch(now, true);
      return true;
    }
    this.lastActivityAt = now;
    return false;
  }

  public tick(now = this.nowProvider()): void {
    this.expireDisconnectedPlayers(now);
    const match = this.match;
    if (!match || match.phase === "finished") return;
    const deltaMs = Math.max(0, now - match.lastTickAt);
    match.lastTickAt = now;

    if (!match.truceWarningSent && now >= match.truceEndsAt - MATCH_CONFIG.truceWarningMs) {
      match.truceWarningSent = true;
      this.emitEvent({
        type: "truceEnding",
        serverTime: now,
        message: "Перемирие закончится через пять секунд",
      });
    }
    if (match.phase === "truce" && now >= match.truceEndsAt) {
      match.phase = "battle";
      this.emitEvent({ type: "truceEnded", serverTime: now, message: "ПЕРЕМИРИЕ ОКОНЧЕНО" });
    }
    if (match.phase === "battle" && now >= match.lastBattleStartsAt) {
      match.phase = "lastBattle";
      if (!match.finalBattleApplied) {
        match.finalBattleApplied = true;
        for (const player of match.players.values()) {
          applyLastBattleBuildingPenalty(player);
          applyLastBattleTrainingBoost(player, now);
        }
      }
      this.emitEvent({
        type: "lastBattleStarted",
        serverTime: now,
        message: "ПОСЛЕДНЯЯ БИТВА: карта раскрыта, экономика и урон усилены",
      });
    }

    for (const player of match.players.values()) {
      tickPlayerEconomy(player, deltaMs, now, match.phase === "lastBattle", (event) => this.emitEvent(event));
    }
    tickCombat(
      match,
      deltaMs,
      now,
      (event) => this.emitEvent(event),
      (winnerId, reason, finishAt) => this.finishMatch(winnerId, reason, finishAt),
    );
    if (this.match?.phase !== "finished" && now >= match.hardEndsAt) {
      const winner = this.chooseTimeLimitWinner(match);
      this.finishMatch(winner.playerId, "timeLimit", now);
    }
  }

  public createSnapshot(playerId: string, now = this.nowProvider()): GameSnapshot {
    if (!this.match) throw new RoomActionError("ROOM_ALREADY_STARTED", "Матч ещё не начался");
    return createSnapshot(this.code, this.match, this.roomPlayers, playerId, now);
  }

  public drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  public isEventVisibleTo(playerId: string, event: GameEvent): boolean {
    if (GLOBAL_EVENT_TYPES.has(event.type) || event.playerId === undefined || event.playerId === playerId) return true;
    const match = this.match;
    const viewer = match?.players.get(playerId);
    if (!match || !viewer || match.phase === "truce" || !event.position) return false;
    return isPointVisible(viewer, event.position, match.phase === "lastBattle" || match.phase === "finished");
  }

  public finishMatch(winnerId: string, reason: FinishReason, now = this.nowProvider()): void {
    const match = this.match;
    if (!match || match.phase === "finished") return;
    match.phase = "finished";
    match.winnerId = winnerId;
    match.finishReason = reason;
    match.rematchVotes.clear();
    this.lastActivityAt = now;
    this.emitEvent({
      type: "matchFinished",
      serverTime: now,
      message: "Матч завершён",
      playerId: winnerId,
    });
  }

  private requirePlayer(playerId: string): RoomPlayer {
    const player = this.roomPlayers.find((candidate) => candidate.playerId === playerId);
    if (!player) throw new RoomActionError("PLAYER_NOT_IN_ROOM", "Игрок не находится в этой комнате");
    return player;
  }

  private startMatch(now: number, rematch = false): void {
    if (this.roomPlayers.length !== 2) throw new RoomActionError("INVALID_REQUEST", "Для матча нужны два игрока");
    this.match = createMatch(this.roomPlayers, now);
    for (const player of this.roomPlayers) player.ready = true;
    this.lastActivityAt = now;
    this.emitEvent({
      type: rematch ? "rematchStarted" : "matchStarted",
      serverTime: now,
      message: rematch ? "Реванш начался" : "Матч начался: 20 секунд перемирия",
    });
  }

  private expireDisconnectedPlayers(now: number): void {
    for (const player of [...this.roomPlayers]) {
      if (player.connected || player.reconnectDeadline === null || now < player.reconnectDeadline) continue;
      if (this.match && this.match.phase !== "finished") {
        const opponent = this.roomPlayers.find((candidate) => candidate.playerId !== player.playerId);
        if (opponent) this.finishMatch(opponent.playerId, "disconnectTimeout", now);
      } else if (!this.match) {
        const index = this.roomPlayers.indexOf(player);
        if (index >= 0) this.roomPlayers.splice(index, 1);
      }
      player.reconnectDeadline = null;
    }
  }

  private chooseTimeLimitWinner(match: MatchState): MatchPlayerState {
    const score = (player: MatchPlayerState): number => {
      const buildingHp = player.buildings.reduce(
        (sum, building) => sum + (building.status === "destroyed" ? 0 : building.hp),
        0,
      );
      const armyPower = player.squads.reduce(
        (sum, squad) => sum + (squad.status === "destroyed" ? 0 : squad.power),
        0,
      );
      const economy = RESOURCE_KINDS.reduce((sum, kind) => sum + player.resources[kind], 0);
      return buildingHp + armyPower * 2 + economy * 0.15 + player.stats.damageDealt * 0.25;
    };
    const players = [...match.players.values()];
    const first = players[0];
    const second = players[1];
    if (!first || !second) throw new Error("A match requires two players");
    return score(first) >= score(second) ? first : second;
  }

  private emitEvent(event: GameEventInput): void {
    this.events.push({ id: randomId("event"), ...event });
  }
}
