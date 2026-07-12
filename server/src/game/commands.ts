import {
  BUILDING_CONFIG,
  MATCH_CONFIG,
  MARKET_RETURN_RATIO,
  MARKET_VALUES,
  RESEARCH_CONFIG,
  RESOURCE_KINDS,
  UNIT_CONFIG,
  UNIT_TYPES,
  type CommandError,
  type GameCommand,
  type GameErrorCode,
  type Point,
  type ResourceAmounts,
  type UnitCounts,
} from "@ashes/shared";
import {
  getBuildingLevelConfig,
  getPopulationView,
  getResearchLevel,
  getResearchMultiplier,
  getSquadMaxHp,
  getStorageCapacity,
  getTownHallLevel,
  getUnitMaxHp,
  populationForUnits,
  refreshSquadDerivedStats,
} from "./economy.js";
import type {
  GameEventSink,
  InternalBuildingState,
  InternalSquadState,
  InternalTrainingOrder,
  MatchPlayerState,
  MatchState,
} from "./model.js";
import {
  addResources,
  canAfford,
  clampPoint,
  cloneResources,
  cloneUnits,
  distance,
  multiplyResources,
  randomId,
  subtractResources,
  sumUnits,
  zeroResources,
  zeroUnits,
} from "./math.js";
import { isPointVisible } from "./visibility.js";

export interface CommandContext {
  now: number;
  match: MatchState;
  player: MatchPlayerState;
  enemy: MatchPlayerState;
  emit: GameEventSink;
}

const error = (code: GameErrorCode, message: string, details?: CommandError["details"]): CommandError => {
  if (details) return { code, message, details };
  return { code, message };
};

const missingResources = (available: Readonly<ResourceAmounts>, cost: Readonly<ResourceAmounts>): ResourceAmounts => {
  const missing = zeroResources();
  for (const kind of RESOURCE_KINDS) missing[kind] = Math.max(0, Math.ceil(cost[kind] - available[kind]));
  return missing;
};

const spend = (player: MatchPlayerState, cost: Readonly<ResourceAmounts>): CommandError | null => {
  if (!canAfford(player.resources, cost)) {
    const missing = missingResources(player.resources, cost);
    return error("INSUFFICIENT_RESOURCES", "Недостаточно ресурсов", {
      wood: missing.wood,
      stone: missing.stone,
      gold: missing.gold,
      iron: missing.iron,
      food: missing.food,
    });
  }
  subtractResources(player.resources, cost);
  return null;
};

const findOwnBuilding = (player: MatchPlayerState, id: string): InternalBuildingState | CommandError => {
  const building = player.buildings.find((candidate) => candidate.id === id);
  if (!building) return error("NOT_FOUND", "Здание не найдено");
  if (building.ownerId !== player.playerId) return error("NOT_OWNER", "Нельзя управлять чужим зданием");
  return building;
};

const findOwnSquad = (player: MatchPlayerState, id: string): InternalSquadState | CommandError => {
  const squad = player.squads.find((candidate) => candidate.id === id && candidate.status !== "destroyed");
  if (!squad) return error("NOT_FOUND", "Отряд не найден");
  if (squad.ownerId !== player.playerId) return error("NOT_OWNER", "Нельзя управлять чужим отрядом");
  return squad;
};

const isCommandError = (value: InternalBuildingState | InternalSquadState | CommandError): value is CommandError =>
  "code" in value;

const nextBuildingPosition = (player: MatchPlayerState): Point => {
  const base = MATCH_CONFIG.basePositions[player.baseIndex];
  const index = player.buildings.filter((building) => building.status !== "destroyed").length;
  const angle = index * 2.399963;
  const radius = Math.min(MATCH_CONFIG.baseBuildRadius - 25, 62 + Math.sqrt(index) * 34);
  return clampPoint(
    { x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius },
    MATCH_CONFIG.arenaWidth,
    MATCH_CONFIG.arenaHeight,
  );
};

const constructBuilding = (
  command: Extract<GameCommand, { type: "building:construct" }>,
  context: CommandContext,
): CommandError | null => {
  const { player, now } = context;
  const config = BUILDING_CONFIG[command.payload.buildingType];
  if (command.payload.buildingType === "townHall") return error("INVALID_COMMAND", "Ратуша уже существует");
  const townHallLevel = getTownHallLevel(player);
  if (townHallLevel < config.unlockTownHall) {
    return error("LOCKED", `Требуется ратуша ${config.unlockTownHall}-го уровня`, {
      requiredTownHallLevel: config.unlockTownHall,
      currentTownHallLevel: townHallLevel,
    });
  }
  const currentCount = player.buildings.filter(
    (building) => building.type === command.payload.buildingType && building.status !== "destroyed",
  ).length;
  if (currentCount >= config.maxCount) return error("LOCKED", `Достигнут лимит здания: ${config.maxCount}`);
  const levelConfig = config.levels[0];
  if (!levelConfig) return error("INVALID_COMMAND", "Баланс здания не настроен");
  const position = command.payload.position
    ? clampPoint(command.payload.position, MATCH_CONFIG.arenaWidth, MATCH_CONFIG.arenaHeight)
    : nextBuildingPosition(player);
  const base = MATCH_CONFIG.basePositions[player.baseIndex];
  if (distance(position, base) > MATCH_CONFIG.baseBuildRadius) {
    return error("TOO_FAR", "Строить можно только внутри территории базы", {
      maxDistance: MATCH_CONFIG.baseBuildRadius,
    });
  }
  if (
    player.buildings.some(
      (building) => building.status !== "destroyed" && distance(building.position, position) < 28,
    )
  ) {
    return error("INVALID_TARGET", "Место строительства занято");
  }
  const paymentError = spend(player, levelConfig.cost);
  if (paymentError) return paymentError;
  const hpMultiplier = context.match.phase === "lastBattle" ? MATCH_CONFIG.finalBattle.buildingHpMultiplier : 1;
  const effectiveMaxHp = levelConfig.maxHp * hpMultiplier;
  const building: InternalBuildingState = {
    id: randomId("building"),
    ownerId: player.playerId,
    type: command.payload.buildingType,
    level: 1,
    status: "constructing",
    hp: Math.max(1, effectiveMaxHp * 0.12),
    maxHp: effectiveMaxHp,
    progress: 0,
    position,
    startedAt: now,
    completesAt: now + levelConfig.timeMs,
    gateOpen: command.payload.buildingType === "gate" ? false : null,
    pendingLevel: null,
    lastTowerAttackAt: 0,
  };
  player.buildings.push(building);
  return null;
};

const upgradeBuilding = (
  command: Extract<GameCommand, { type: "building:upgrade" }>,
  context: CommandContext,
): CommandError | null => {
  const building = findOwnBuilding(context.player, command.payload.buildingId);
  if (isCommandError(building)) return building;
  if (building.status !== "active") return error("BUSY", "Здание ещё не готово");
  const config = BUILDING_CONFIG[building.type];
  const nextLevel = building.level + 1;
  const next = config.levels[nextLevel - 1];
  if (!next) return error("LOCKED", "Здание уже максимального уровня");
  if (building.type !== "townHall" && getTownHallLevel(context.player) < Math.min(4, nextLevel)) {
    return error("LOCKED", `Для этого улучшения нужна ратуша ${Math.min(4, nextLevel)}-го уровня`);
  }
  const paymentError = spend(context.player, next.cost);
  if (paymentError) return paymentError;
  building.status = "upgrading";
  building.pendingLevel = nextLevel;
  building.startedAt = context.now;
  building.completesAt = context.now + next.timeMs;
  building.progress = 0;
  return null;
};

const queueTraining = (
  command: Extract<GameCommand, { type: "training:queue" }>,
  context: CommandContext,
): CommandError | null => {
  const building = findOwnBuilding(context.player, command.payload.buildingId);
  if (isCommandError(building)) return building;
  if (building.status !== "active") return error("BUSY", "Учебное здание ещё не готово");
  const unit = UNIT_CONFIG[command.payload.unitType];
  if (building.type !== unit.trainingBuilding || BUILDING_CONFIG[building.type].trains !== command.payload.unitType) {
    return error("INVALID_COMMAND", "Этот тип войск нельзя обучать в выбранном здании");
  }
  if (getTownHallLevel(context.player) < unit.unlockTownHall) {
    return error("LOCKED", `Требуется ратуша ${unit.unlockTownHall}-го уровня`);
  }
  const queuedForBuilding = context.player.trainingQueue
    .filter((order) => order.buildingId === building.id)
    .reduce((sum, order) => sum + order.remaining, 0);
  if (queuedForBuilding + command.payload.count > MATCH_CONFIG.trainingQueueCapacity) {
    return error("QUEUE_FULL", `Очередь вмещает ${MATCH_CONFIG.trainingQueueCapacity} бойцов`);
  }
  const requiredPopulation = unit.population * command.payload.count;
  const population = getPopulationView(context.player);
  if (population.free < requiredPopulation) {
    return error("INSUFFICIENT_POPULATION", "Недостаточно свободного населения", {
      requiredPopulation,
      freePopulation: population.free,
    });
  }
  const totalCost = multiplyResources(unit.cost, command.payload.count);
  const paymentError = spend(context.player, totalCost);
  if (paymentError) return paymentError;

  const sameBuilding = context.player.trainingQueue.filter((order) => order.buildingId === building.id);
  const last = sameBuilding.at(-1);
  let trainingMs = unit.trainingMs / getResearchMultiplier(context.player, "trainingSpeed");
  trainingMs /= 1 + (building.level - 1) * 0.12;
  if (context.match.phase === "lastBattle") trainingMs *= MATCH_CONFIG.finalBattle.trainingTimeMultiplier;
  trainingMs = Math.max(400, Math.round(trainingMs));
  const previousEnd = last ? last.nextCompletionAt + Math.max(0, last.remaining - 1) * last.trainingMs : context.now;
  const firstCompletionAt = Math.max(context.now, previousEnd) + trainingMs;
  const order: InternalTrainingOrder = {
    id: randomId("training"),
    buildingId: building.id,
    unitType: command.payload.unitType,
    total: command.payload.count,
    completed: 0,
    remaining: command.payload.count,
    nextCompletionAt: firstCompletionAt,
    startedAt: context.now,
    trainingMs,
    progress: 0,
    reservedPopulation: requiredPopulation,
    spent: totalCost,
    unitCost: cloneResources(unit.cost),
    populationPerUnit: unit.population,
  };
  context.player.populationReserved += requiredPopulation;
  context.player.trainingQueue.push(order);
  return null;
};

const cancelTraining = (
  command: Extract<GameCommand, { type: "training:cancel" }>,
  context: CommandContext,
): CommandError | null => {
  const order = context.player.trainingQueue.find((candidate) => candidate.id === command.payload.queueId);
  if (!order) return error("NOT_FOUND", "Элемент очереди не найден");
  const refund = multiplyResources(order.unitCost, order.remaining * MATCH_CONFIG.trainingRefundRatio);
  const capacity = getStorageCapacity(context.player);
  for (const kind of RESOURCE_KINDS) context.player.resources[kind] = Math.min(capacity, context.player.resources[kind] + refund[kind]);
  context.player.populationReserved -= order.reservedPopulation;
  context.player.trainingQueue = context.player.trainingQueue.filter((candidate) => candidate.id !== order.id);
  return null;
};

const tradeResources = (
  command: Extract<GameCommand, { type: "market:trade" }>,
  context: CommandContext,
): CommandError | null => {
  const { sell, buy, amount } = command.payload;
  if (sell === buy) return error("INVALID_COMMAND", "Выберите разные ресурсы");
  const market = context.player.buildings.find((building) => building.type === "market" && building.status === "active");
  if (!market) return error("LOCKED", "Для обмена нужен построенный рынок");
  if (context.player.resources[sell] < amount) return error("INSUFFICIENT_RESOURCES", `Недостаточно ресурса: ${sell}`);
  const levelBonus = 1 + (market.level - 1) * 0.03;
  const received = Math.floor((amount * MARKET_VALUES[sell] * MARKET_RETURN_RATIO * levelBonus) / MARKET_VALUES[buy]);
  if (received < 1) return error("INVALID_COMMAND", "Сумма обмена слишком мала для выбранного курса");
  const capacity = getStorageCapacity(context.player);
  if (context.player.resources[buy] + received > capacity) return error("STORAGE_FULL", "На складе нет места для обмена");
  context.player.resources[sell] -= amount;
  context.player.resources[buy] += received;
  return null;
};

const startResearch = (
  command: Extract<GameCommand, { type: "research:start" }>,
  context: CommandContext,
): CommandError | null => {
  if (context.player.activeResearch) return error("BUSY", "Другое исследование уже выполняется");
  const config = RESEARCH_CONFIG[command.payload.researchType];
  const townHallLevel = getTownHallLevel(context.player);
  if (townHallLevel < config.unlockTownHall) return error("LOCKED", `Требуется ратуша ${config.unlockTownHall}-го уровня`);
  if (
    config.requiresForge &&
    !context.player.buildings.some((building) => building.type === "forge" && building.status === "active")
  ) {
    return error("LOCKED", "Для этого исследования нужна кузница");
  }
  const currentLevel = getResearchLevel(context.player, command.payload.researchType);
  if (currentLevel >= config.maxLevel) return error("LOCKED", "Исследование уже максимального уровня");
  const targetLevel = currentLevel + 1;
  const cost = config.costs[targetLevel - 1];
  const time = config.timesMs[targetLevel - 1];
  if (!cost || time === undefined) return error("INVALID_COMMAND", "Баланс исследования не настроен");
  const paymentError = spend(context.player, cost);
  if (paymentError) return paymentError;
  context.player.activeResearch = {
    id: randomId("research"),
    type: command.payload.researchType,
    targetLevel,
    startedAt: context.now,
    completesAt: context.now + time,
    progress: 0,
    cost: cloneResources(cost),
  };
  return null;
};

const validateComposition = (composition: UnitCounts): CommandError | null => {
  for (const unitType of UNIT_TYPES) {
    if (!Number.isInteger(composition[unitType]) || composition[unitType] < 0) {
      return error("INVALID_COMPOSITION", "Состав отряда содержит недопустимое количество");
    }
  }
  const total = sumUnits(composition);
  if (total <= 0) return error("INVALID_COMPOSITION", "Отряд не может быть пустым");
  if (total > MATCH_CONFIG.maxSquadUnits) return error("INVALID_COMPOSITION", `Максимум ${MATCH_CONFIG.maxSquadUnits} бойцов`);
  const population = populationForUnits(composition);
  if (population > MATCH_CONFIG.maxSquadPopulation) {
    return error("INVALID_COMPOSITION", `Максимальный размер отряда: ${MATCH_CONFIG.maxSquadPopulation} населения`);
  }
  return null;
};

const nextSquadNumber = (player: MatchPlayerState): number => {
  for (let number = 1; number <= MATCH_CONFIG.maxSquads; number += 1) {
    if (!player.squads.some((squad) => squad.number === number && squad.status !== "destroyed")) return number;
  }
  return MATCH_CONFIG.maxSquads;
};

const makeSquad = (
  player: MatchPlayerState,
  now: number,
  name: string,
  composition: UnitCounts,
  formation: InternalSquadState["formation"],
  behavior: InternalSquadState["behavior"],
  position: Point,
): InternalSquadState => {
  const unitHealth = zeroUnits();
  for (const unitType of UNIT_TYPES) unitHealth[unitType] = composition[unitType] * getUnitMaxHp(player, unitType);
  const squad: InternalSquadState = {
    id: randomId("squad"),
    ownerId: player.playerId,
    number: nextSquadNumber(player),
    name: name.trim().slice(0, 24),
    composition: cloneUnits(composition),
    unitHealth,
    formation,
    behavior,
    status: "idle",
    target: null,
    position: { ...position },
    route: [],
    hp: 0,
    maxHp: 0,
    power: 0,
    speed: 0,
    etaMs: null,
    lastCombatAt: null,
    attackReadyAt: { infantry: now, archer: now, cavalry: now, catapult: now },
    healingStartedAt: null,
  };
  refreshSquadDerivedStats(player, squad);
  return squad;
};

const createSquad = (
  command: Extract<GameCommand, { type: "squad:create" }>,
  context: CommandContext,
): CommandError | null => {
  const activeSquads = context.player.squads.filter((squad) => squad.status !== "destroyed");
  if (activeSquads.length >= MATCH_CONFIG.maxSquads) return error("SQUAD_LIMIT", "Можно иметь не более четырёх отрядов");
  const compositionError = validateComposition(command.payload.composition);
  if (compositionError) return compositionError;
  for (const unitType of UNIT_TYPES) {
    if (context.player.garrison[unitType] < command.payload.composition[unitType]) {
      return error("INVALID_COMPOSITION", `В гарнизоне недостаточно: ${UNIT_CONFIG[unitType].label}`);
    }
  }
  for (const unitType of UNIT_TYPES) context.player.garrison[unitType] -= command.payload.composition[unitType];
  const base = MATCH_CONFIG.basePositions[context.player.baseIndex];
  const squad = makeSquad(
    context.player,
    context.now,
    command.payload.name || `Отряд ${activeSquads.length + 1}`,
    command.payload.composition,
    command.payload.formation,
    command.payload.behavior,
    base,
  );
  context.player.squads.push(squad);
  context.player.stats.squadsCreated += 1;
  context.emit({
    type: "squadCreated",
    serverTime: context.now,
    message: `${squad.name} сформирован`,
    playerId: context.player.playerId,
    entityIds: [squad.id],
    position: { ...squad.position },
  });
  return null;
};

const routeSquad = (squad: InternalSquadState, route: Point[], target: InternalSquadState["target"], status: InternalSquadState["status"]): void => {
  squad.route = route.map((point) => clampPoint(point, MATCH_CONFIG.arenaWidth, MATCH_CONFIG.arenaHeight));
  squad.target = target;
  squad.status = status;
  squad.etaMs = null;
};

const moveSquad = (
  command: Extract<GameCommand, { type: "squad:move" }>,
  context: CommandContext,
): CommandError | null => {
  const squad = findOwnSquad(context.player, command.payload.squadId);
  if (isCommandError(squad)) return squad;
  if (squad.status === "healing") return error("BUSY", "Сначала завершите лечение");
  const destination = clampPoint(command.payload.destination, MATCH_CONFIG.arenaWidth, MATCH_CONFIG.arenaHeight);
  const base = MATCH_CONFIG.basePositions[context.player.baseIndex];
  const via = (command.payload.route ?? []).slice(0, MATCH_CONFIG.maxRoutePoints).map((point) =>
    clampPoint(point, MATCH_CONFIG.arenaWidth, MATCH_CONFIG.arenaHeight),
  );
  if (
    context.match.phase === "truce" &&
    [...via, destination].some((point) => distance(point, base) > MATCH_CONFIG.baseBuildRadius)
  ) {
    return error("TRUCE_ACTIVE", "Во время перемирия отряд не может покидать зону подготовки");
  }
  routeSquad(squad, [...via, destination], { kind: "position", position: destination }, "moving");
  return null;
};

const targetSquad = (
  command: Extract<GameCommand, { type: "squad:target" }>,
  context: CommandContext,
): CommandError | null => {
  const squad = findOwnSquad(context.player, command.payload.squadId);
  if (isCommandError(squad)) return squad;
  const target = command.payload.target;
  const offensive = target.kind === "enemyBase" || target.kind === "enemyBuilding" || target.kind === "enemySquad";
  if (offensive && context.match.phase === "truce") return error("TRUCE_ACTIVE", "Атака недоступна до окончания перемирия");
  if (
    target.kind === "position" &&
    context.match.phase === "truce" &&
    distance(
      clampPoint(target.position, MATCH_CONFIG.arenaWidth, MATCH_CONFIG.arenaHeight),
      MATCH_CONFIG.basePositions[context.player.baseIndex],
    ) > MATCH_CONFIG.baseBuildRadius
  ) {
    return error("TRUCE_ACTIVE", "Во время перемирия отряд не может покидать зону подготовки");
  }
  const revealAll = context.match.phase === "lastBattle" || context.match.phase === "finished";
  const enemySquad = target.kind === "enemySquad"
    ? context.enemy.squads.find((candidate) => candidate.id === target.squadId && candidate.status !== "destroyed")
    : undefined;
  if (target.kind === "enemySquad" && (!enemySquad || !isPointVisible(context.player, enemySquad.position, revealAll))) {
    return error("INVALID_TARGET", "Вражеский отряд не виден");
  }
  const enemyBuilding = target.kind === "enemyBuilding"
    ? context.enemy.buildings.find((candidate) => candidate.id === target.buildingId && candidate.status !== "destroyed")
    : undefined;
  if (target.kind === "enemyBuilding" && (!enemyBuilding || !isPointVisible(context.player, enemyBuilding.position, revealAll))) {
    return error("INVALID_TARGET", "Вражеское здание не видно");
  }
  let destination: Point;
  if (target.kind === "enemySquad") {
    destination = enemySquad?.position ?? squad.position;
  } else if (target.kind === "enemyBuilding") {
    destination = enemyBuilding?.position ?? squad.position;
  } else if (target.kind === "enemyBase") {
    destination = MATCH_CONFIG.basePositions[context.enemy.baseIndex];
  } else if (target.kind === "defendBase" || target.kind === "home") {
    destination = MATCH_CONFIG.basePositions[context.player.baseIndex];
  } else {
    destination = clampPoint(target.position, MATCH_CONFIG.arenaWidth, MATCH_CONFIG.arenaHeight);
  }
  routeSquad(squad, [{ ...destination }], target, target.kind === "home" ? "returning" : "moving");
  return null;
};

const stopSquad = (
  command: Extract<GameCommand, { type: "squad:stop" }>,
  context: CommandContext,
): CommandError | null => {
  const squad = findOwnSquad(context.player, command.payload.squadId);
  if (isCommandError(squad)) return squad;
  squad.route = [];
  squad.target = null;
  squad.status = "idle";
  squad.etaMs = null;
  return null;
};

const retreatSquad = (
  command: Extract<GameCommand, { type: "squad:retreat" }>,
  context: CommandContext,
): CommandError | null => {
  const squad = findOwnSquad(context.player, command.payload.squadId);
  if (isCommandError(squad)) return squad;
  const home = MATCH_CONFIG.basePositions[context.player.baseIndex];
  routeSquad(squad, [{ ...home }], { kind: "home" }, "retreating");
  return null;
};

const mergeSquads = (
  command: Extract<GameCommand, { type: "squad:merge" }>,
  context: CommandContext,
): CommandError | null => {
  if (command.payload.sourceSquadId === command.payload.targetSquadId) return error("INVALID_COMMAND", "Выберите два разных отряда");
  const source = findOwnSquad(context.player, command.payload.sourceSquadId);
  const target = findOwnSquad(context.player, command.payload.targetSquadId);
  if (isCommandError(source)) return source;
  if (isCommandError(target)) return target;
  if (distance(source.position, target.position) > 70) return error("TOO_FAR", "Отряды должны находиться рядом");
  const combined = zeroUnits();
  for (const unitType of UNIT_TYPES) combined[unitType] = source.composition[unitType] + target.composition[unitType];
  const compositionError = validateComposition(combined);
  if (compositionError) return compositionError;
  for (const unitType of UNIT_TYPES) {
    target.composition[unitType] += source.composition[unitType];
    target.unitHealth[unitType] += source.unitHealth[unitType];
  }
  refreshSquadDerivedStats(context.player, target);
  context.player.squads = context.player.squads.filter((candidate) => candidate.id !== source.id);
  return null;
};

const splitSquad = (
  command: Extract<GameCommand, { type: "squad:split" }>,
  context: CommandContext,
): CommandError | null => {
  if (context.player.squads.filter((squad) => squad.status !== "destroyed").length >= MATCH_CONFIG.maxSquads) {
    return error("SQUAD_LIMIT", "Нельзя создать пятый отряд");
  }
  const source = findOwnSquad(context.player, command.payload.squadId);
  if (isCommandError(source)) return source;
  const compositionError = validateComposition(command.payload.composition);
  if (compositionError) return compositionError;
  let strictlySmaller = false;
  for (const unitType of UNIT_TYPES) {
    if (source.composition[unitType] < command.payload.composition[unitType]) {
      return error("INVALID_COMPOSITION", "В исходном отряде недостаточно бойцов");
    }
    if (source.composition[unitType] > command.payload.composition[unitType]) strictlySmaller = true;
  }
  if (!strictlySmaller) return error("INVALID_COMPOSITION", "При разделении в исходном отряде должны остаться бойцы");
  const newSquad = makeSquad(
    context.player,
    context.now,
    command.payload.name,
    command.payload.composition,
    command.payload.formation,
    command.payload.behavior,
    source.position,
  );
  for (const unitType of UNIT_TYPES) {
    const oldCount = source.composition[unitType];
    const movedCount = command.payload.composition[unitType];
    const perUnitHealth = oldCount > 0 ? source.unitHealth[unitType] / oldCount : 0;
    newSquad.unitHealth[unitType] = perUnitHealth * movedCount;
    source.composition[unitType] -= movedCount;
    source.unitHealth[unitType] -= perUnitHealth * movedCount;
  }
  refreshSquadDerivedStats(context.player, source);
  refreshSquadDerivedStats(context.player, newSquad);
  context.player.squads.push(newSquad);
  context.player.stats.squadsCreated += 1;
  return null;
};

const hospitalizeSquad = (
  command: Extract<GameCommand, { type: "squad:hospitalize" }>,
  context: CommandContext,
): CommandError | null => {
  const squad = findOwnSquad(context.player, command.payload.squadId);
  if (isCommandError(squad)) return squad;
  const hospital = context.player.buildings.find((building) => building.type === "hospital" && building.status === "active");
  if (!hospital) return error("LOCKED", "Нужна построенная больница");
  const home = MATCH_CONFIG.basePositions[context.player.baseIndex];
  if (distance(squad.position, home) > MATCH_CONFIG.hospitalReturnRadius) return error("TOO_FAR", "Отряд должен вернуться к базе");
  refreshSquadDerivedStats(context.player, squad);
  if (squad.hp >= squad.maxHp - 0.01) return error("INVALID_COMMAND", "Отряд не нуждается в лечении");
  const capacity = getBuildingLevelConfig(hospital).hospitalCapacity ?? 0;
  const occupied = context.player.squads
    .filter((candidate) => candidate.status === "healing")
    .reduce((sum, candidate) => sum + sumUnits(candidate.composition), 0);
  if (occupied + sumUnits(squad.composition) > capacity) return error("QUEUE_FULL", "Больница переполнена");
  squad.route = [];
  squad.target = null;
  squad.status = "healing";
  squad.healingStartedAt = context.now;
  context.emit({
    type: "healingStarted",
    serverTime: context.now,
    message: `${squad.name} отправлен на лечение`,
    playerId: context.player.playerId,
    entityIds: [squad.id, hospital.id],
    position: { ...squad.position },
  });
  return null;
};

const setGate = (
  command: Extract<GameCommand, { type: "gate:set" }>,
  context: CommandContext,
): CommandError | null => {
  const building = findOwnBuilding(context.player, command.payload.buildingId);
  if (isCommandError(building)) return building;
  if (building.type !== "gate") return error("INVALID_COMMAND", "Выбранное здание не является воротами");
  if (building.status !== "active") return error("BUSY", "Ворота ещё не готовы");
  building.gateOpen = command.payload.open;
  return null;
};

export const executeCommand = (command: GameCommand, context: CommandContext): CommandError | null => {
  switch (command.type) {
    case "building:construct":
      return constructBuilding(command, context);
    case "building:upgrade":
      return upgradeBuilding(command, context);
    case "training:queue":
      return queueTraining(command, context);
    case "training:cancel":
      return cancelTraining(command, context);
    case "market:trade":
      return tradeResources(command, context);
    case "research:start":
      return startResearch(command, context);
    case "squad:create":
      return createSquad(command, context);
    case "squad:move":
      return moveSquad(command, context);
    case "squad:target":
      return targetSquad(command, context);
    case "squad:stop":
      return stopSquad(command, context);
    case "squad:retreat":
      return retreatSquad(command, context);
    case "squad:merge":
      return mergeSquads(command, context);
    case "squad:split":
      return splitSquad(command, context);
    case "squad:hospitalize":
      return hospitalizeSquad(command, context);
    case "gate:set":
      return setGate(command, context);
  }
};
