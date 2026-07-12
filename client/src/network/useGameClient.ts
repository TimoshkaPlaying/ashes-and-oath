import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { MARKET_RETURN_RATIO, MARKET_VALUES } from '@ashes/shared';
import type {
  ClientToServerEvents,
  GameCommand,
  GameEvent,
  GameSnapshot,
  LobbyState,
  RoomError,
  RoomJoined,
  ServerToClientEvents,
} from '@ashes/shared';
import { BUILDINGS, RESEARCH, UNITS } from '../data/gameData';
import { DEMO_GAME } from '../data/gameData';
import type {
  BuildingView,
  EventView,
  GameView,
  LobbyView,
  NetworkState,
  PlayerView,
  QueueItemView,
  ToastMessage,
} from '../types/domain';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type PendingGameCommand = GameCommand extends infer TCommand
  ? TCommand extends GameCommand
    ? Omit<TCommand, 'id' | 'seq'>
    : never
  : never;

const SESSION_KEY = 'ashes.reconnect.v1';
const DISPLAY_NAME_KEY = 'ashes.display-name.v1';
const IS_DEMO = new URLSearchParams(window.location.search).has('demo');

interface StoredSession {
  code: string;
  reconnectToken: string;
}

function readSession(): StoredSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as StoredSession | null;
    return value?.code && value.reconnectToken ? value : null;
  } catch {
    return null;
  }
}

function saveSession(joined: RoomJoined) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code: joined.code, reconnectToken: joined.reconnectToken }));
}

function createSocket(): GameSocket {
  const configuredUrl = import.meta.env.VITE_SERVER_URL;
  const defaultUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';
  const options = {
    autoConnect: true,
    transports: ['websocket', 'polling'] as string[],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 4_000,
    timeout: 7_000,
  };
  const serverUrl = configuredUrl ?? defaultUrl;
  return serverUrl === '' ? io(options) : io(serverUrl, options);
}

function lobbyPlayerToView(player: LobbyState['players'][number]): PlayerView {
  return {
    id: player.playerId,
    name: player.displayName,
    kingdomName: player.customization.kingdomName,
    color: player.customization.color,
    flag: player.customization.flag,
    crest: player.customization.emblem,
    ready: player.ready,
    connected: player.connected,
    population: 0,
    populationCap: 0,
    townHallLevel: 1,
  };
}

function normalizeLobby(lobby: LobbyState, selfId: string): LobbyView {
  return {
    roomCode: lobby.code,
    selfId,
    hostId: lobby.players.find((player) => player.host)?.playerId ?? selfId,
    players: lobby.players.map(lobbyPlayerToView),
  };
}

function normalizeSnapshot(snapshot: GameSnapshot, events: EventView[]): GameView {
  const self = snapshot.self;
  const opponent = snapshot.opponent;
  const buildings: BuildingView[] = [
    ...self.buildings.map((building) => ({
      id: building.id,
      ownerId: building.ownerId,
      type: building.type,
      level: building.level,
      hp: building.hp,
      maxHp: building.maxHp,
      x: building.position.x,
      y: building.position.y,
      state: building.status === 'constructing' ? 'building' as const : building.status,
      progress: building.progress,
      gateOpen: building.gateOpen,
      visible: true,
    })),
    ...snapshot.visibleEnemyBuildings.map((building) => ({
      id: building.id,
      ownerId: building.ownerId,
      type: building.type,
      level: building.level,
      hp: building.hp,
      maxHp: building.maxHp,
      x: building.position.x,
      y: building.position.y,
      state: building.status === 'constructing' ? 'building' as const : building.status,
      progress: building.progress,
      gateOpen: building.gateOpen,
      visible: true,
    })),
  ];

  const now = snapshot.serverTime;
  const queues: QueueItemView[] = [];
  for (const item of self.trainingQueue) {
    const definition = UNITS.find((unit) => unit.type === item.unitType);
    const currentDuration = Math.max(1, item.nextCompletionAt - item.startedAt);
    const currentProgress = Math.max(0, Math.min(1, (now - item.startedAt) / currentDuration));
    queues.push({
      id: item.id,
      kind: 'training',
      label: `${definition?.label ?? item.unitType} ×${item.remaining}`,
      progress: Math.min(1, (item.completed + currentProgress) / Math.max(1, item.total)),
      secondsLeft: Math.max(0, Math.ceil((item.nextCompletionAt - now) / 1000)),
      icon: definition?.icon,
    });
  }
  for (const building of self.buildings) {
    if (building.status !== 'constructing' && building.status !== 'upgrading') continue;
    const definition = BUILDINGS.find((candidate) => candidate.type === building.type);
    queues.push({
      id: building.id,
      kind: 'building',
      label: `${definition?.label ?? 'Ратуша'}, ур. ${building.level}`,
      progress: building.progress,
      secondsLeft: building.completesAt ? Math.max(0, Math.ceil((building.completesAt - now) / 1000)) : 0,
      icon: definition?.icon ?? '🏰',
    });
  }
  if (self.activeResearch) {
    const definition = RESEARCH.find((research) => research.id === self.activeResearch?.type);
    queues.push({
      id: self.activeResearch.id,
      kind: 'research',
      label: definition?.label ?? self.activeResearch.type,
      progress: self.activeResearch.progress,
      secondsLeft: Math.max(0, Math.ceil((self.activeResearch.completesAt - now) / 1000)),
      icon: definition?.icon ?? '📜',
    });
  }

  const resourcesGathered = Object.values(self.stats.resourcesGathered).reduce((sum, value) => sum + value, 0);

  return {
    roomCode: snapshot.roomCode,
    selfId: snapshot.playerId,
    phase: snapshot.phase,
    serverTime: snapshot.serverTime,
    truceEndsAt: snapshot.truceEndsAt,
    matchEndsAt: snapshot.hardEndsAt,
    lastBattleEndsAt: snapshot.phase === 'lastBattle' ? snapshot.phaseEndsAt ?? undefined : undefined,
    self: {
      id: self.playerId,
      name: self.displayName,
      kingdomName: self.customization.kingdomName,
      color: self.customization.color,
      flag: self.customization.flag,
      crest: self.customization.emblem,
      ready: true,
      connected: self.connected,
      population: self.population.free,
      populationCap: self.population.capacity,
      townHallLevel: self.townHallLevel,
    },
    opponent: {
      id: opponent?.playerId ?? 'unknown',
      name: opponent?.displayName ?? 'Неизвестный владыка',
      kingdomName: opponent?.customization.kingdomName ?? 'Скрыто туманом',
      color: opponent?.customization.color ?? '#8b302c',
      flag: opponent?.customization.flag ?? 'wolf',
      crest: opponent?.customization.emblem ?? 'raven',
      ready: true,
      connected: opponent?.connected ?? false,
      population: 0,
      populationCap: 0,
      townHallLevel: 0,
    },
    resources: self.resources,
    reserveUnits: self.garrison,
    buildings,
    squads: [...self.squads, ...snapshot.visibleEnemySquads].map((squad) => ({
      id: squad.id,
      ownerId: squad.ownerId,
      name: squad.name,
      index: squad.number,
      units: squad.composition,
      hp: squad.hp,
      maxHp: squad.maxHp,
      power: squad.power,
      speed: squad.speed,
      formation: squad.formation,
      behavior: squad.behavior,
      status: squad.status,
      x: squad.position.x,
      y: squad.position.y,
      targetX: squad.target?.kind === 'position' ? squad.target.position.x : squad.route.at(-1)?.x,
      targetY: squad.target?.kind === 'position' ? squad.target.position.y : squad.route.at(-1)?.y,
      etaSeconds: squad.etaMs === null ? undefined : Math.ceil(squad.etaMs / 1000),
      visible: true,
    })),
    queues,
    events,
    winnerId: snapshot.winnerId ?? undefined,
    stats: {
      durationSeconds: Math.max(0, Math.floor((snapshot.serverTime - snapshot.startedAt) / 1000)),
      resourcesGathered,
      buildingsBuilt: self.stats.buildingsConstructed,
      unitsTrained: self.stats.unitsTrained,
      unitsLost: self.stats.unitsLost,
      unitsKilled: self.stats.unitsKilled,
      damageDealt: self.stats.damageDealt,
      buildingsDestroyed: self.stats.buildingsDestroyed,
      squadsCreated: self.stats.squadsCreated,
      researchCompleted: self.stats.researchCompleted,
    },
  };
}

function gameEventToView(event: GameEvent): EventView {
  const dangerTypes = new Set(['buildingDamaged', 'buildingDestroyed', 'unitKilled', 'squadDestroyed', 'playerDisconnected']);
  const successTypes = new Set(['buildingCompleted', 'buildingUpgraded', 'unitTrained', 'researchCompleted', 'squadCreated', 'playerReconnected']);
  return {
    id: event.id,
    at: event.serverTime,
    type: dangerTypes.has(event.type) ? 'danger' : successTypes.has(event.type) ? 'success' : event.type === 'truceEnding' ? 'warning' : 'info',
    message: event.message,
  };
}

function errorTitle(error: RoomError) {
  switch (error.code) {
    case 'ROOM_NOT_FOUND': return 'Комната не найдена';
    case 'ROOM_FULL': return 'В комнате уже два игрока';
    case 'ROOM_ALREADY_STARTED': return 'Сражение уже началось';
    case 'NAME_TAKEN': return 'Это имя уже занято';
    case 'RATE_LIMITED': return 'Слишком много запросов';
    default: return 'Не удалось войти';
  }
}

function initialState(): NetworkState {
  if (IS_DEMO) {
    return {
      connection: 'connected', ping: 28, screen: 'game', lobby: null, game: DEMO_GAME,
      resumeSeconds: null, toasts: [],
    };
  }
  return {
    connection: 'connecting', ping: null, screen: 'menu', lobby: null, game: null,
    resumeSeconds: null, toasts: [],
  };
}

export function useGameClient() {
  const [state, setState] = useState<NetworkState>(initialState);
  const socketRef = useRef<GameSocket | null>(null);
  const selfIdRef = useRef('');
  const seqRef = useRef(1);
  const eventLogRef = useRef<EventView[]>([]);
  const toastTimersRef = useRef(new Set<number>());
  const attemptedResumeRef = useRef(false);
  const disconnectDeadlineRef = useRef<number | null>(null);

  const removeToast = useCallback((id: string) => {
    setState((current) => ({ ...current, toasts: current.toasts.filter((toast) => toast.id !== id) }));
  }, []);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = crypto.randomUUID();
    setState((current) => ({ ...current, toasts: [...current.toasts.slice(-3), { ...toast, id }] }));
    const timer = window.setTimeout(() => {
      removeToast(id);
      toastTimersRef.current.delete(timer);
    }, 4_800);
    toastTimersRef.current.add(timer);
  }, [removeToast]);

  useEffect(() => {
    if (IS_DEMO) {
      const timer = window.setInterval(() => {
        setState((current) => {
          if (!current.game) return current;
          const now = Date.now();
          const truceFinished = current.game.phase === 'truce' && now >= current.game.truceEndsAt;
          return {
            ...current,
            game: {
              ...current.game,
              serverTime: now,
              phase: truceFinished ? 'battle' : current.game.phase,
              squads: truceFinished
                ? current.game.squads.map((squad) => ({ ...squad, visible: true }))
                : current.game.squads,
              buildings: truceFinished
                ? current.game.buildings.map((building) => ({ ...building, visible: true }))
                : current.game.buildings,
            },
          };
        });
      }, 250);
      return () => window.clearInterval(timer);
    }

    const socket = createSocket();
    socketRef.current = socket;

    const acceptJoined = (joined: RoomJoined) => {
      saveSession(joined);
      selfIdRef.current = joined.playerId;
      attemptedResumeRef.current = true;
      setState((current) => ({
        ...current,
        screen: 'lobby',
        lobby: normalizeLobby(joined.lobby, joined.playerId),
        connection: 'connected',
        resumeSeconds: null,
      }));
    };

    const showRoomError = (error: RoomError) => {
      if (error.code === 'INVALID_RECONNECT_TOKEN' || error.code === 'PLAYER_NOT_IN_ROOM' || error.code === 'ROOM_NOT_FOUND') {
        localStorage.removeItem(SESSION_KEY);
      }
      addToast({ tone: 'danger', title: errorTitle(error), detail: error.message });
    };

    socket.on('connect', () => {
      disconnectDeadlineRef.current = null;
      setState((current) => ({ ...current, connection: 'connected', resumeSeconds: null }));
      const session = readSession();
      if (session && !attemptedResumeRef.current) {
        attemptedResumeRef.current = true;
        socket.emit('room:resume', session, (response) => {
          if ('reconnectToken' in response) acceptJoined(response);
          else showRoomError(response);
        });
      }
    });
    socket.on('disconnect', () => {
      const hasSession = Boolean(readSession());
      if (hasSession) attemptedResumeRef.current = false;
      disconnectDeadlineRef.current = hasSession ? Date.now() + 60_000 : null;
      setState((current) => ({
        ...current,
        connection: hasSession ? 'reconnecting' : 'offline',
        resumeSeconds: hasSession ? 60 : null,
      }));
    });
    socket.io.on('reconnect_attempt', () => setState((current) => ({ ...current, connection: 'reconnecting' })));
    socket.on('connect_error', () => setState((current) => ({
      ...current,
      connection: readSession() ? 'reconnecting' : 'offline',
    })));
    socket.on('room:joined', acceptJoined);
    socket.on('room:error', showRoomError);
    socket.on('lobby:state', (lobby) => {
      setState((current) => ({
        ...current,
        screen: lobby.status === 'finished' ? 'results' : current.screen,
        lobby: normalizeLobby(lobby, selfIdRef.current),
      }));
    });
    socket.on('game:snapshot', (snapshot) => {
      selfIdRef.current = snapshot.playerId;
      seqRef.current = snapshot.self.nextCommandSeq;
      setState((current) => ({
        ...current,
        screen: snapshot.phase === 'finished' ? 'results' : 'game',
        game: normalizeSnapshot(snapshot, eventLogRef.current),
      }));
    });
    socket.on('game:event', (event) => {
      if (event.type === 'rematchStarted') seqRef.current = 1;
      const view = gameEventToView(event);
      eventLogRef.current = [view, ...eventLogRef.current].slice(0, 60);
      setState((current) => current.game ? {
        ...current,
        game: { ...current.game, events: eventLogRef.current },
      } : current);
      if (event.type === 'resourceCapped') addToast({ tone: 'warning', title: 'Склад заполнен', detail: event.message });
      if (event.type === 'buildingDamaged') addToast({ tone: 'danger', title: 'На королевство напали', detail: event.message });
    });
    socket.on('game:command-result', (result) => {
      const expectedSeq = result.error?.details?.expectedSeq;
      if (typeof expectedSeq === 'number') {
        seqRef.current = expectedSeq;
      } else if (
        !result.ok &&
        (result.error?.code === 'RATE_LIMITED' || result.error?.code === 'INVALID_COMMAND' || result.error?.code === 'NOT_IN_MATCH')
      ) {
        seqRef.current = result.seq;
      } else {
        seqRef.current = result.seq + 1;
      }
      if (!result.ok && result.error) {
        addToast({ tone: 'danger', title: 'Приказ отклонён', detail: result.error.message });
      }
    });
    socket.on('connection:status', (event) => {
      addToast({
        tone: event.connected ? 'success' : 'warning',
        title: event.connected ? 'Соперник вернулся' : 'Противник переподключается',
        detail: event.message,
      });
      setState((current) => ({
        ...current,
        lobby: current.lobby ? {
          ...current.lobby,
          players: current.lobby.players.map((player) => player.id === event.playerId ? { ...player, connected: event.connected } : player),
        } : null,
        game: current.game && current.game.opponent.id === event.playerId
          ? { ...current.game, opponent: { ...current.game.opponent, connected: event.connected } }
          : current.game,
      }));
    });
    socket.on('ping:response', ({ clientTime }) => {
      setState((current) => ({ ...current, ping: Math.max(0, Math.round(performance.now() - clientTime)) }));
    });

    const pingTimer = window.setInterval(() => {
      if (socket.connected) socket.emit('ping:request', { clientTime: performance.now() });
    }, 3_000);
    const countdownTimer = window.setInterval(() => {
      if (disconnectDeadlineRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((disconnectDeadlineRef.current - Date.now()) / 1000));
      setState((current) => ({ ...current, resumeSeconds: remaining }));
    }, 500);

    return () => {
      window.clearInterval(pingTimer);
      window.clearInterval(countdownTimer);
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addToast]);

  useEffect(() => () => {
    for (const timer of toastTimersRef.current) window.clearTimeout(timer);
    toastTimersRef.current.clear();
  }, []);

  const handleJoinResponse = useCallback((response: RoomJoined | RoomError) => {
    if ('reconnectToken' in response) {
      saveSession(response);
      selfIdRef.current = response.playerId;
      setState((current) => ({
        ...current,
        screen: 'lobby',
        lobby: normalizeLobby(response.lobby, response.playerId),
      }));
      addToast({ tone: 'success', title: response.resumed ? 'Связь восстановлена' : 'Комната готова' });
    } else {
      addToast({ tone: 'danger', title: errorTitle(response), detail: response.message });
    }
  }, [addToast]);

  const createRoom = useCallback((displayName: string) => {
    const name = displayName.trim().slice(0, 24) || 'Полководец';
    localStorage.setItem(DISPLAY_NAME_KEY, name);
    if (!socketRef.current?.connected) {
      addToast({ tone: 'danger', title: 'Сервер недоступен', detail: 'Проверьте, запущен ли сервер игры.' });
      return;
    }
    socketRef.current.emit('room:create', { displayName: name }, handleJoinResponse);
  }, [addToast, handleJoinResponse]);

  const joinRoom = useCallback((code: string, displayName: string) => {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 4) {
      addToast({ tone: 'warning', title: 'Введите код комнаты', detail: 'Код состоит из 5 символов.' });
      return;
    }
    const name = displayName.trim().slice(0, 24) || 'Полководец';
    localStorage.setItem(DISPLAY_NAME_KEY, name);
    if (!socketRef.current?.connected) {
      addToast({ tone: 'danger', title: 'Сервер недоступен', detail: 'Подключение будет восстановлено автоматически.' });
      return;
    }
    socketRef.current.emit('room:join', { code: normalizedCode, displayName: name }, handleJoinResponse);
  }, [addToast, handleJoinResponse]);

  const updateLobby = useCallback((customization: { kingdomName?: string; color?: string; flag?: string; crest?: string }) => {
    socketRef.current?.emit('lobby:update', {
      customization: {
        kingdomName: customization.kingdomName,
        color: customization.color,
        flag: customization.flag,
        emblem: customization.crest,
      },
    });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socketRef.current?.emit('lobby:ready', { ready });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    localStorage.removeItem(SESSION_KEY);
    selfIdRef.current = '';
    eventLogRef.current = [];
    seqRef.current = 1;
    attemptedResumeRef.current = false;
    setState((current) => ({ ...current, screen: 'menu', lobby: null, game: null, resumeSeconds: null }));
  }, []);

  const simulateCommand = useCallback((command: PendingGameCommand) => {
    setState((current) => {
      if (!current.game) return current;
      const game = current.game;
      if (command.type === 'squad:move') {
        return { ...current, game: { ...game, squads: game.squads.map((squad) => squad.id === command.payload.squadId ? {
          ...squad,
          status: 'moving',
          targetX: command.payload.destination.x,
          targetY: command.payload.destination.y,
          etaSeconds: 8,
        } : squad) } };
      }
      if (command.type === 'squad:stop') {
        return { ...current, game: { ...game, squads: game.squads.map((squad) => squad.id === command.payload.squadId ? { ...squad, status: 'idle', targetX: undefined, targetY: undefined } : squad) } };
      }
      if (command.type === 'squad:retreat') {
        return { ...current, game: { ...game, squads: game.squads.map((squad) => squad.id === command.payload.squadId ? { ...squad, status: 'retreating', targetX: 300, targetY: 800 } : squad) } };
      }
      if (command.type === 'squad:create') {
        const total = Object.values(command.payload.composition).reduce((sum, value) => sum + value, 0);
        if (!total || game.squads.filter((squad) => squad.ownerId === game.selfId && squad.status !== 'destroyed').length >= 4) return current;
        const id = `demo-${Date.now()}`;
        return { ...current, game: { ...game, squads: [...game.squads, {
          id, ownerId: game.selfId, name: command.payload.name, index: game.squads.length + 1,
          units: command.payload.composition, hp: total * 90, maxHp: total * 90, power: total * 24, speed: 48,
          formation: command.payload.formation, behavior: command.payload.behavior, status: 'idle', x: 470, y: 790, visible: true,
        }] } };
      }
      if (command.type === 'building:upgrade') {
        return { ...current, game: { ...game, buildings: game.buildings.map((building) => building.id === command.payload.buildingId ? {
          ...building,
          level: building.level + 1,
          hp: Math.round(building.maxHp * 1.18),
          maxHp: Math.round(building.maxHp * 1.18),
          state: 'active',
          progress: 1,
        } : building) } };
      }
      if (command.type === 'gate:set') {
        return { ...current, game: { ...game, buildings: game.buildings.map((building) => building.id === command.payload.buildingId ? {
          ...building,
          gateOpen: command.payload.open,
        } : building) } };
      }
      if (command.type === 'market:trade') {
        const { sell, buy, amount } = command.payload;
        const received = Math.floor((amount * MARKET_VALUES[sell] * MARKET_RETURN_RATIO) / MARKET_VALUES[buy]);
        if (sell === buy || received < 1 || game.resources[sell].amount < amount) return current;
        return { ...current, game: { ...game, resources: {
          ...game.resources,
          [sell]: { ...game.resources[sell], amount: game.resources[sell].amount - amount },
          [buy]: { ...game.resources[buy], amount: Math.min(game.resources[buy].capacity, game.resources[buy].amount + received) },
        } } };
      }
      const definition = command.type === 'building:construct'
        ? BUILDINGS.find((item) => item.type === command.payload.buildingType)
        : command.type === 'training:queue'
          ? UNITS.find((item) => item.type === command.payload.unitType)
          : command.type === 'research:start'
            ? RESEARCH.find((item) => item.id === command.payload.researchType)
            : undefined;
      if (definition) {
        const kind = command.type === 'building:construct' ? 'building' : command.type === 'training:queue' ? 'training' : 'research';
        const count = command.type === 'training:queue' ? command.payload.count : 1;
        return { ...current, game: { ...game, queues: [...game.queues, {
          id: `demo-q-${Date.now()}`, kind, label: `${definition.label}${count > 1 ? ` ×${count}` : ''}`,
          progress: 0.03, secondsLeft: definition.seconds * count, icon: definition.icon,
        }] } };
      }
      return current;
    });
    addToast({ tone: 'success', title: 'Приказ принят', detail: 'Учебная арена исполняет команду.' });
  }, [addToast]);

  const sendCommand = useCallback((command: PendingGameCommand) => {
    if (IS_DEMO) {
      simulateCommand(command);
      return;
    }
    if (!socketRef.current?.connected) {
      addToast({ tone: 'warning', title: 'Приказ сохранён не был', detail: 'Дождитесь восстановления связи.' });
      return;
    }
    const envelope = {
      ...command,
      id: crypto.randomUUID(),
      seq: seqRef.current,
    } as GameCommand;
    seqRef.current += 1;
    socketRef.current.emit('game:command', envelope);
  }, [addToast, simulateCommand]);

  const requestRematch = useCallback((want: boolean) => {
    if (IS_DEMO) {
      setState((current) => ({ ...current, screen: 'game', game: { ...DEMO_GAME, serverTime: Date.now(), truceEndsAt: Date.now() + 20_000 } }));
      return;
    }
    socketRef.current?.emit('game:rematch', { want });
    addToast({ tone: 'neutral', title: want ? 'Предложение реванша отправлено' : 'Реванш отменён' });
  }, [addToast]);

  const showMenu = useCallback(() => {
    socketRef.current?.emit('room:leave');
    localStorage.removeItem(SESSION_KEY);
    selfIdRef.current = '';
    eventLogRef.current = [];
    seqRef.current = 1;
    attemptedResumeRef.current = false;
    setState((current) => ({ ...current, screen: 'menu', lobby: null, game: null, resumeSeconds: null }));
  }, []);

  return {
    state,
    createRoom,
    joinRoom,
    updateLobby,
    setReady,
    leaveRoom,
    sendCommand,
    requestRematch,
    showMenu,
    removeToast,
    addToast,
  };
}

export type GameClient = ReturnType<typeof useGameClient>;
export type { PendingGameCommand };
