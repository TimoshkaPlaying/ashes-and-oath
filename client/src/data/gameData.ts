import type {
  Behavior,
  BuildingType,
  Formation,
  GameView,
  ResourceKey,
  UnitType,
} from '../types/domain';

export interface Cost {
  wood?: number;
  stone?: number;
  gold?: number;
  iron?: number;
  food?: number;
  population?: number;
}

export interface BuildingDefinition {
  type: BuildingType;
  label: string;
  description: string;
  icon: string;
  townHall: number;
  seconds: number;
  cost: Cost;
}

export interface UnitDefinition {
  type: UnitType;
  label: string;
  description: string;
  icon: string;
  building: string;
  townHall: number;
  seconds: number;
  cost: Cost;
}

export interface ResearchDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  townHall: number;
  seconds: number;
  maxLevel: number;
  cost: Cost;
}

export const RESOURCE_ORDER: ResourceKey[] = ['wood', 'stone', 'gold', 'iron', 'food'];

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  wood: 'Дерево',
  stone: 'Камень',
  gold: 'Золото',
  iron: 'Железо',
  food: 'Еда',
};

export const BUILDINGS: BuildingDefinition[] = [
  { type: 'sawmill', label: 'Лесопилка', description: 'Добывает дерево для построек.', icon: '🪵', townHall: 1, seconds: 3, cost: { wood: 120, stone: 30 } },
  { type: 'farm', label: 'Ферма', description: 'Снабжает жителей и армию едой.', icon: '🌾', townHall: 1, seconds: 3, cost: { wood: 90, stone: 20 } },
  { type: 'house', label: 'Жилой дом', description: 'Увеличивает предел населения.', icon: '🏠', townHall: 1, seconds: 3, cost: { wood: 110, stone: 40 } },
  { type: 'warehouse', label: 'Склад', description: 'Повышает вместимость ресурсов.', icon: '📦', townHall: 1, seconds: 4, cost: { wood: 130, stone: 90 } },
  { type: 'barracks', label: 'Казарма', description: 'Обучает стойкую пехоту.', icon: '⚔️', townHall: 1, seconds: 4, cost: { wood: 160, stone: 100 } },
  { type: 'wall', label: 'Стена', description: 'Сдерживает вражеские отряды.', icon: '🧱', townHall: 1, seconds: 2, cost: { stone: 100, wood: 30 } },
  { type: 'gate', label: 'Ворота', description: 'Контролируют проход к замку.', icon: '🚪', townHall: 1, seconds: 3, cost: { wood: 90, stone: 120 } },
  { type: 'quarry', label: 'Каменоломня', description: 'Добывает камень для укреплений.', icon: '⛰️', townHall: 2, seconds: 4, cost: { wood: 150, stone: 60 } },
  { type: 'market', label: 'Рынок', description: 'Позволяет обменивать ресурсы.', icon: '⚖️', townHall: 2, seconds: 5, cost: { wood: 180, stone: 100, gold: 60 } },
  { type: 'archeryRange', label: 'Стрельбище', description: 'Обучает дальнобойных лучников.', icon: '🏹', townHall: 2, seconds: 5, cost: { wood: 210, stone: 80, gold: 50 } },
  { type: 'tower', label: 'Башня', description: 'Автоматически обстреливает врага.', icon: '🏰', townHall: 2, seconds: 5, cost: { wood: 100, stone: 220, gold: 50 } },
  { type: 'goldMine', label: 'Золотая шахта', description: 'Добывает золото для элитных войск.', icon: '🪙', townHall: 3, seconds: 5, cost: { wood: 190, stone: 180 } },
  { type: 'ironMine', label: 'Железная шахта', description: 'Добывает железо для оружия.', icon: '⛏️', townHall: 3, seconds: 5, cost: { wood: 190, stone: 210 } },
  { type: 'stable', label: 'Конюшня', description: 'Обучает быструю кавалерию.', icon: '🐎', townHall: 3, seconds: 6, cost: { wood: 250, stone: 140, gold: 120, iron: 90 } },
  { type: 'hospital', label: 'Больница', description: 'Возвращает выживших в строй.', icon: '✚', townHall: 3, seconds: 5, cost: { wood: 180, stone: 160, gold: 100 } },
  { type: 'forge', label: 'Кузница', description: 'Открывает боевые исследования.', icon: '⚒️', townHall: 3, seconds: 6, cost: { wood: 170, stone: 220, iron: 100 } },
  { type: 'siegeWorkshop', label: 'Осадная мастерская', description: 'Создаёт разрушительные катапульты.', icon: '💥', townHall: 4, seconds: 8, cost: { wood: 360, stone: 280, gold: 160, iron: 240 } },
];

export const UNITS: UnitDefinition[] = [
  { type: 'infantry', label: 'Пехотинец', description: 'Крепкий боец первой линии.', icon: '🛡️', building: 'Казарма', townHall: 1, seconds: 2, cost: { food: 25, iron: 10, population: 1 } },
  { type: 'archer', label: 'Лучник', description: 'Поражает медленные цели издалека.', icon: '🏹', building: 'Стрельбище', townHall: 2, seconds: 3, cost: { wood: 15, food: 30, gold: 8, population: 1 } },
  { type: 'cavalry', label: 'Кавалерист', description: 'Сминает лучников стремительным ударом.', icon: '🐴', building: 'Конюшня', townHall: 3, seconds: 5, cost: { food: 60, gold: 35, iron: 30, population: 2 } },
  { type: 'catapult', label: 'Катапульта', description: 'Наносит высокий урон строениям.', icon: '☄️', building: 'Осадная мастерская', townHall: 4, seconds: 7, cost: { wood: 90, stone: 55, iron: 45, population: 3 } },
];

export const RESEARCH: ResearchDefinition[] = [
  { id: 'infantryDamage', label: 'Закалённая сталь', description: '+12% к урону пехоты.', icon: '⚔️', townHall: 3, seconds: 6, maxLevel: 3, cost: { gold: 90, iron: 80 } },
  { id: 'armor', label: 'Пластинчатая броня', description: '+10% к броне войск.', icon: '🛡️', townHall: 3, seconds: 7, maxLevel: 3, cost: { gold: 100, iron: 120 } },
  { id: 'archerRange', label: 'Тетива из жил', description: '+8% к дальности лучников.', icon: '🏹', townHall: 3, seconds: 6, maxLevel: 3, cost: { wood: 100, gold: 85 } },
  { id: 'cavalrySpeed', label: 'Лёгкие подковы', description: '+10% к скорости кавалерии.', icon: '🐎', townHall: 3, seconds: 6, maxLevel: 3, cost: { gold: 110, iron: 70 } },
  { id: 'catapultDamage', label: 'Усиленные плечи', description: '+15% к урону катапульт.', icon: '💥', townHall: 4, seconds: 9, maxLevel: 3, cost: { wood: 120, gold: 130, iron: 150 } },
  { id: 'trainingSpeed', label: 'Строевая выучка', description: '-10% ко времени обучения.', icon: '⏱️', townHall: 2, seconds: 5, maxLevel: 3, cost: { food: 120, gold: 70 } },
  { id: 'woodProduction', label: 'Цеховые уставы', description: '+10% к производству дерева.', icon: '📜', townHall: 2, seconds: 5, maxLevel: 3, cost: { wood: 100, stone: 100, gold: 50 } },
  { id: 'healing', label: 'Полевые лекари', description: '+15% к скорости лечения.', icon: '✚', townHall: 3, seconds: 7, maxLevel: 3, cost: { food: 100, gold: 100 } },
];

export const FORMATIONS: Array<{ value: Formation; label: string; description: string }> = [
  { value: 'line', label: 'Линия', description: 'Ровный фронт без штрафов.' },
  { value: 'defensive', label: 'Защитный строй', description: 'Стойкость против конницы.' },
  { value: 'wedge', label: 'Клин', description: 'Сильный первый натиск.' },
  { value: 'loose', label: 'Свободный строй', description: 'Меньше урона по площади.' },
  { value: 'protectSiege', label: 'Защита катапульт', description: 'Пехота прикрывает осаду.' },
];

export const BEHAVIORS: Array<{ value: Behavior; label: string }> = [
  { value: 'aggressive', label: 'Агрессивный' },
  { value: 'defensive', label: 'Оборонительный' },
  { value: 'holdPosition', label: 'Держать позицию' },
  { value: 'avoidCombat', label: 'Избегать боя' },
  { value: 'buildingsOnly', label: 'Только здания' },
  { value: 'nearestEnemy', label: 'Ближайший враг' },
];

const now = Date.now();

export const DEMO_GAME: GameView = {
  roomCode: 'ASH7K',
  selfId: 'blue',
  phase: 'truce',
  serverTime: now,
  truceEndsAt: now + 17_000,
  matchEndsAt: now + 12 * 60_000,
  self: {
    id: 'blue', name: 'Странник', kingdomName: 'Серебряный Предел', color: '#2f6fb2', flag: 'lion', crest: 'crown', ready: true, connected: true,
    population: 34, populationCap: 60, townHallLevel: 2,
  },
  opponent: {
    id: 'red', name: 'Соперник', kingdomName: 'Багровая Марка', color: '#a7332b', flag: 'wolf', crest: 'raven', ready: true, connected: true,
    population: 29, populationCap: 60, townHallLevel: 2,
  },
  resources: {
    wood: { amount: 620, capacity: 900, perMinute: 36 },
    stone: { amount: 410, capacity: 900, perMinute: 28 },
    gold: { amount: 250, capacity: 700, perMinute: 18 },
    iron: { amount: 175, capacity: 700, perMinute: 14 },
    food: { amount: 690, capacity: 900, perMinute: 40 },
  },
  reserveUnits: { infantry: 14, archer: 9, cavalry: 2, catapult: 0 },
  buildings: [
    { id: 'th-blue', ownerId: 'blue', type: 'townHall', level: 2, hp: 5200, maxHp: 5200, x: 245, y: 790, state: 'active', visible: true },
    { id: 'b-blue', ownerId: 'blue', type: 'barracks', level: 1, hp: 1400, maxHp: 1400, x: 415, y: 790, state: 'active', visible: true },
    { id: 'saw-blue', ownerId: 'blue', type: 'sawmill', level: 1, hp: 900, maxHp: 900, x: 315, y: 690, state: 'active', visible: true },
    { id: 'farm-blue', ownerId: 'blue', type: 'farm', level: 2, hp: 980, maxHp: 980, x: 440, y: 890, state: 'active', visible: true },
    { id: 'warehouse-blue', ownerId: 'blue', type: 'warehouse', level: 1, hp: 1200, maxHp: 1200, x: 180, y: 900, state: 'active', visible: true },
    { id: 'market-blue', ownerId: 'blue', type: 'market', level: 1, hp: 1050, maxHp: 1050, x: 490, y: 705, state: 'active', visible: true },
    { id: 'gate-blue', ownerId: 'blue', type: 'gate', level: 1, hp: 1800, maxHp: 1800, x: 525, y: 810, state: 'active', gateOpen: false, visible: true },
    { id: 'th-red', ownerId: 'red', type: 'townHall', level: 2, hp: 5200, maxHp: 5200, x: 1775, y: 210, state: 'active', visible: false },
    { id: 'tower-red', ownerId: 'red', type: 'tower', level: 2, hp: 1700, maxHp: 1700, x: 1620, y: 260, state: 'active', visible: false },
    { id: 'gate-red', ownerId: 'red', type: 'gate', level: 1, hp: 1800, maxHp: 1800, x: 1520, y: 310, state: 'active', gateOpen: false, visible: false },
  ],
  squads: [
    { id: 's1', ownerId: 'blue', name: 'Стражи клятвы', index: 1, units: { infantry: 10, archer: 4, cavalry: 0, catapult: 0 }, hp: 1260, maxHp: 1400, power: 318, speed: 48, formation: 'defensive', behavior: 'defensive', status: 'idle', x: 560, y: 720, visible: true },
    { id: 's2', ownerId: 'blue', name: 'Синие стрелы', index: 2, units: { infantry: 2, archer: 8, cavalry: 2, catapult: 0 }, hp: 890, maxHp: 980, power: 344, speed: 55, formation: 'line', behavior: 'nearestEnemy', status: 'moving', x: 780, y: 650, targetX: 1020, targetY: 570, etaSeconds: 7, visible: true },
    { id: 'e1', ownerId: 'red', name: 'Багровый клин', index: 1, units: { infantry: 6, archer: 3, cavalry: 4, catapult: 0 }, hp: 1040, maxHp: 1200, power: 390, speed: 62, formation: 'wedge', behavior: 'aggressive', status: 'moving', x: 1300, y: 430, visible: false },
  ],
  queues: [
    { id: 'q1', kind: 'training', label: 'Пехотинцы ×6', progress: 0.64, secondsLeft: 7, icon: '🛡️' },
    { id: 'q2', kind: 'building', label: 'Склад, ур. 2', progress: 0.38, secondsLeft: 4, icon: '📦' },
    { id: 'q3', kind: 'research', label: 'Строевая выучка', progress: 0.22, secondsLeft: 11, icon: '📜' },
  ],
  events: [
    { id: 'ev1', at: now - 92_000, type: 'success', message: 'Стройка завершена: Лесопилка' },
    { id: 'ev2', at: now - 54_000, type: 'info', message: 'Обучены пехотинцы ×12' },
    { id: 'ev3', at: now - 31_000, type: 'scout', message: 'Разведчики заняли Северный мост' },
    { id: 'ev4', at: now - 12_000, type: 'warning', message: 'Склад дерева заполнен на 80%' },
  ],
};
