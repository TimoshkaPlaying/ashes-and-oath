import type {
  BuildingType,
  Formation,
  ResearchType,
  ResourceAmounts,
  ResourceKind,
  UnitType,
} from "./types.js";

export interface BuildingLevelConfig {
  cost: ResourceAmounts;
  timeMs: number;
  maxHp: number;
  productionPerMinute?: Partial<Record<ResourceKind, number>>;
  storageBonus?: number;
  populationCapacityBonus?: number;
  populationPerMinute?: number;
  hospitalCapacity?: number;
  healingPerMinute?: number;
  towerDamage?: number;
  towerRange?: number;
}

export interface BuildingConfig {
  label: string;
  description: string;
  unlockTownHall: 1 | 2 | 3 | 4;
  maxCount: number;
  function:
    | "townHall"
    | "production"
    | "population"
    | "storage"
    | "trade"
    | "healing"
    | "training"
    | "research"
    | "defense"
    | "gate"
    | "tower";
  trains?: UnitType;
  levels: readonly BuildingLevelConfig[];
}

export interface UnitConfig {
  label: string;
  description: string;
  unlockTownHall: 1 | 2 | 3 | 4;
  trainingBuilding: BuildingType;
  cost: ResourceAmounts;
  trainingMs: number;
  population: number;
  maxHp: number;
  damage: number;
  armor: number;
  speed: number;
  attackIntervalMs: number;
  range: number;
  vision: number;
  buildingDamageMultiplier: number;
  strengths: readonly string[];
  weaknesses: readonly string[];
}

export interface FormationConfig {
  label: string;
  damageMultiplier: number;
  armorMultiplier: number;
  speedMultiplier: number;
  rangedDamageTakenMultiplier: number;
  cavalryDamageTakenMultiplier: number;
  siegeProtectionMultiplier: number;
}

export interface ResearchConfig {
  label: string;
  description: string;
  unlockTownHall: 1 | 2 | 3 | 4;
  requiresForge: boolean;
  maxLevel: 3;
  costs: readonly ResourceAmounts[];
  timesMs: readonly number[];
  effectPerLevel: number;
}

const r = (
  wood = 0,
  stone = 0,
  gold = 0,
  iron = 0,
  food = 0,
): ResourceAmounts => ({ wood, stone, gold, iron, food });

export const EMPTY_RESOURCES: Readonly<ResourceAmounts> = Object.freeze(r());

export const MATCH_CONFIG = {
  protocolVersion: 1,
  tickMs: 100,
  snapshotMs: 200,
  truceMs: 30 * 60_000,
  truceWarningMs: 5 * 60_000,
  reconnectMs: 60_000,
  lastBattleAtMs: 75 * 60_000,
  hardLimitMs: 90 * 60_000,
  roomIdleCleanupMs: 2 * 60 * 60_000,
  commandRateLimit: 30,
  commandRateWindowMs: 5_000,
  commandHistorySize: 128,
  baseStorageCapacity: 1_200,
  startingResources: r(760, 420, 300, 180, 680),
  startingPopulation: 16,
  startingPopulationCapacity: 24,
  populationReleaseDelayMs: 5_000,
  trainingQueueCapacity: 12,
  trainingRefundRatio: 0.75,
  maxSquads: 4,
  maxSquadUnits: 36,
  maxSquadPopulation: 48,
  baseBuildRadius: 260,
  arenaWidth: 2_000,
  arenaHeight: 1_000,
  basePositions: [
    { x: 150, y: 500 },
    { x: 1_850, y: 500 },
  ] as const,
  bridgeY: 500,
  riverX: 1_000,
  squadArrivalDistance: 12,
  squadCollisionDistance: 34,
  baseVisionRadius: 310,
  defaultVisionRadius: 255,
  maxRoutePoints: 8,
  towerAttackIntervalMs: 1_200,
  hospitalReturnRadius: 280,
  finalBattle: {
    productionMultiplier: 1.8,
    trainingTimeMultiplier: 0.65,
    damageMultiplier: 1.35,
    buildingHpMultiplier: 0.75,
  },
} as const;

export const BUILDING_CONFIG: Readonly<Record<BuildingType, BuildingConfig>> = {
  townHall: {
    label: "Ратуша",
    description: "Сердце королевства: открывает новые эпохи, здания, войска и исследования.",
    unlockTownHall: 1,
    maxCount: 1,
    function: "townHall",
    levels: [
      { cost: r(), timeMs: 0, maxHp: 2_800 },
      { cost: r(360, 180, 80, 0, 120), timeMs: 7_000, maxHp: 3_500 },
      { cost: r(500, 360, 220, 80, 180), timeMs: 9_500, maxHp: 4_300 },
      { cost: r(680, 520, 360, 220, 260), timeMs: 12_000, maxHp: 5_200 },
    ],
  },
  sawmill: {
    label: "Лесопилка",
    description: "Заготавливает древесину для строительства и осадных машин.",
    unlockTownHall: 1,
    maxCount: 3,
    function: "production",
    levels: [
      { cost: r(80, 0, 0, 0, 30), timeMs: 1_800, maxHp: 620, productionPerMinute: { wood: 150 } },
      { cost: r(140, 40, 20, 0, 50), timeMs: 4_000, maxHp: 760, productionPerMinute: { wood: 230 } },
      { cost: r(220, 100, 60, 20, 80), timeMs: 6_000, maxHp: 920, productionPerMinute: { wood: 330 } },
    ],
  },
  quarry: {
    label: "Каменоломня",
    description: "Добывает камень для укреплений и улучшений.",
    unlockTownHall: 2,
    maxCount: 3,
    function: "production",
    levels: [
      { cost: r(130, 20, 0, 0, 45), timeMs: 2_800, maxHp: 720, productionPerMinute: { stone: 125 } },
      { cost: r(190, 80, 40, 0, 65), timeMs: 4_800, maxHp: 880, productionPerMinute: { stone: 195 } },
      { cost: r(280, 150, 90, 30, 90), timeMs: 6_800, maxHp: 1_050, productionPerMinute: { stone: 285 } },
    ],
  },
  goldMine: {
    label: "Золотая шахта",
    description: "Добывает золото для элитных войск, торговли и исследований.",
    unlockTownHall: 3,
    maxCount: 2,
    function: "production",
    levels: [
      { cost: r(180, 140, 40, 0, 60), timeMs: 3_600, maxHp: 760, productionPerMinute: { gold: 90 } },
      { cost: r(250, 200, 100, 30, 90), timeMs: 5_500, maxHp: 930, productionPerMinute: { gold: 145 } },
      { cost: r(350, 280, 180, 80, 120), timeMs: 7_500, maxHp: 1_120, productionPerMinute: { gold: 215 } },
    ],
  },
  ironMine: {
    label: "Железная шахта",
    description: "Добывает железо для брони, кавалерии и катапульт.",
    unlockTownHall: 3,
    maxCount: 2,
    function: "production",
    levels: [
      { cost: r(180, 160, 50, 0, 60), timeMs: 3_800, maxHp: 800, productionPerMinute: { iron: 82 } },
      { cost: r(260, 230, 110, 30, 90), timeMs: 5_800, maxHp: 970, productionPerMinute: { iron: 132 } },
      { cost: r(370, 320, 190, 90, 130), timeMs: 7_800, maxHp: 1_170, productionPerMinute: { iron: 195 } },
    ],
  },
  farm: {
    label: "Ферма",
    description: "Производит еду для жителей и армии.",
    unlockTownHall: 1,
    maxCount: 4,
    function: "production",
    levels: [
      { cost: r(65, 0, 0, 0, 20), timeMs: 1_400, maxHp: 540, productionPerMinute: { food: 175 } },
      { cost: r(120, 30, 15, 0, 30), timeMs: 3_500, maxHp: 660, productionPerMinute: { food: 270 } },
      { cost: r(190, 75, 45, 10, 55), timeMs: 5_500, maxHp: 800, productionPerMinute: { food: 390 } },
    ],
  },
  house: {
    label: "Жилой дом",
    description: "Увеличивает предел населения и постепенно привлекает новых жителей.",
    unlockTownHall: 1,
    maxCount: 6,
    function: "population",
    levels: [
      { cost: r(90, 15, 0, 0, 35), timeMs: 1_900, maxHp: 520, populationCapacityBonus: 10, populationPerMinute: 15 },
      { cost: r(150, 55, 25, 0, 55), timeMs: 4_000, maxHp: 650, populationCapacityBonus: 16, populationPerMinute: 24 },
      { cost: r(230, 110, 70, 20, 85), timeMs: 6_000, maxHp: 790, populationCapacityBonus: 24, populationPerMinute: 36 },
    ],
  },
  warehouse: {
    label: "Склад",
    description: "Увеличивает безопасную вместимость всех материальных ресурсов.",
    unlockTownHall: 1,
    maxCount: 3,
    function: "storage",
    levels: [
      { cost: r(110, 55, 0, 0, 25), timeMs: 2_200, maxHp: 780, storageBonus: 650 },
      { cost: r(180, 120, 45, 10, 45), timeMs: 4_500, maxHp: 960, storageBonus: 1_050 },
      { cost: r(270, 210, 110, 45, 70), timeMs: 6_500, maxHp: 1_180, storageBonus: 1_600 },
    ],
  },
  market: {
    label: "Рынок",
    description: "Обменивает ресурсы по курсу со встроенной торговой комиссией.",
    unlockTownHall: 2,
    maxCount: 1,
    function: "trade",
    levels: [
      { cost: r(160, 80, 50, 0, 60), timeMs: 3_000, maxHp: 720 },
      { cost: r(240, 140, 100, 20, 80), timeMs: 5_000, maxHp: 900 },
      { cost: r(340, 220, 180, 60, 110), timeMs: 7_000, maxHp: 1_080 },
    ],
  },
  hospital: {
    label: "Больница",
    description: "Лечит раненые отряды, вернувшиеся к базе.",
    unlockTownHall: 3,
    maxCount: 1,
    function: "healing",
    levels: [
      { cost: r(210, 120, 100, 20, 120), timeMs: 3_800, maxHp: 800, hospitalCapacity: 18, healingPerMinute: 280 },
      { cost: r(300, 200, 170, 50, 170), timeMs: 5_800, maxHp: 980, hospitalCapacity: 28, healingPerMinute: 430 },
      { cost: r(430, 300, 270, 100, 240), timeMs: 7_800, maxHp: 1_190, hospitalCapacity: 42, healingPerMinute: 620 },
    ],
  },
  barracks: {
    label: "Казарма",
    description: "Обучает выносливую пехоту.",
    unlockTownHall: 1,
    maxCount: 2,
    function: "training",
    trains: "infantry",
    levels: [
      { cost: r(130, 45, 0, 10, 55), timeMs: 2_400, maxHp: 850 },
      { cost: r(210, 100, 55, 35, 80), timeMs: 4_800, maxHp: 1_050 },
      { cost: r(310, 180, 120, 75, 120), timeMs: 6_800, maxHp: 1_280 },
    ],
  },
  archeryRange: {
    label: "Стрельбище",
    description: "Обучает лучников для дальнего боя.",
    unlockTownHall: 2,
    maxCount: 2,
    function: "training",
    trains: "archer",
    levels: [
      { cost: r(170, 60, 35, 0, 65), timeMs: 2_900, maxHp: 760 },
      { cost: r(250, 120, 85, 20, 95), timeMs: 5_000, maxHp: 940 },
      { cost: r(360, 210, 155, 60, 135), timeMs: 7_000, maxHp: 1_150 },
    ],
  },
  stable: {
    label: "Конюшня",
    description: "Обучает стремительную тяжёлую кавалерию.",
    unlockTownHall: 3,
    maxCount: 2,
    function: "training",
    trains: "cavalry",
    levels: [
      { cost: r(220, 120, 100, 55, 110), timeMs: 3_600, maxHp: 900 },
      { cost: r(320, 210, 180, 100, 160), timeMs: 5_800, maxHp: 1_110 },
      { cost: r(450, 310, 290, 170, 230), timeMs: 7_800, maxHp: 1_350 },
    ],
  },
  siegeWorkshop: {
    label: "Осадная мастерская",
    description: "Собирает катапульты, сокрушающие укрепления и плотные строи.",
    unlockTownHall: 4,
    maxCount: 1,
    function: "training",
    trains: "catapult",
    levels: [
      { cost: r(330, 230, 160, 130, 100), timeMs: 4_800, maxHp: 1_000 },
      { cost: r(460, 340, 260, 220, 150), timeMs: 7_000, maxHp: 1_250 },
      { cost: r(620, 470, 390, 330, 210), timeMs: 9_000, maxHp: 1_520 },
    ],
  },
  forge: {
    label: "Кузница",
    description: "Проводит военные исследования и улучшает оружие и броню.",
    unlockTownHall: 3,
    maxCount: 1,
    function: "research",
    levels: [
      { cost: r(200, 150, 110, 70, 70), timeMs: 3_500, maxHp: 820 },
      { cost: r(300, 240, 190, 130, 100), timeMs: 5_500, maxHp: 1_010 },
      { cost: r(430, 350, 300, 220, 150), timeMs: 7_500, maxHp: 1_230 },
    ],
  },
  wall: {
    label: "Стена",
    description: "Прочная линия обороны, которую противник должен проломить.",
    unlockTownHall: 1,
    maxCount: 8,
    function: "defense",
    levels: [
      { cost: r(70, 90, 0, 0, 0), timeMs: 1_500, maxHp: 1_400 },
      { cost: r(100, 170, 30, 20, 0), timeMs: 4_000, maxHp: 2_150 },
      { cost: r(150, 280, 80, 70, 0), timeMs: 6_500, maxHp: 3_200 },
    ],
  },
  gate: {
    label: "Ворота",
    description: "Управляемый проход, задерживающий противника в закрытом состоянии.",
    unlockTownHall: 2,
    maxCount: 1,
    function: "gate",
    levels: [
      { cost: r(130, 130, 30, 25, 0), timeMs: 2_600, maxHp: 1_650 },
      { cost: r(200, 220, 75, 70, 0), timeMs: 4_800, maxHp: 2_450 },
      { cost: r(300, 350, 150, 140, 0), timeMs: 7_000, maxHp: 3_550 },
    ],
  },
  tower: {
    label: "Оборонительная башня",
    description: "Автоматически обстреливает врагов в ограниченном радиусе.",
    unlockTownHall: 2,
    maxCount: 4,
    function: "tower",
    levels: [
      { cost: r(150, 170, 45, 20, 0), timeMs: 3_000, maxHp: 1_100, towerDamage: 22, towerRange: 235 },
      { cost: r(230, 270, 100, 65, 0), timeMs: 5_200, maxHp: 1_500, towerDamage: 34, towerRange: 265 },
      { cost: r(350, 410, 190, 140, 0), timeMs: 7_500, maxHp: 2_000, towerDamage: 52, towerRange: 300 },
    ],
  },
};

export const UNIT_CONFIG: Readonly<Record<UnitType, UnitConfig>> = {
  infantry: {
    label: "Пехота",
    description: "Стойкие бойцы ближнего боя, прикрывающие стрелков и осаду.",
    unlockTownHall: 1,
    trainingBuilding: "barracks",
    cost: r(8, 0, 6, 12, 38),
    trainingMs: 1_700,
    population: 1,
    maxHp: 125,
    damage: 15,
    armor: 7,
    speed: 51,
    attackIntervalMs: 850,
    range: 24,
    vision: 255,
    buildingDamageMultiplier: 0.48,
    strengths: ["защитный строй", "кавалерия", "прикрытие"],
    weaknesses: ["дальний обстрел", "осадный урон"],
  },
  archer: {
    label: "Лучники",
    description: "Хрупкие дальнобойные бойцы, опасные для медленной пехоты.",
    unlockTownHall: 2,
    trainingBuilding: "archeryRange",
    cost: r(20, 0, 12, 4, 34),
    trainingMs: 2_200,
    population: 1,
    maxHp: 72,
    damage: 13,
    armor: 2,
    speed: 49,
    attackIntervalMs: 1_000,
    range: 185,
    vision: 295,
    buildingDamageMultiplier: 0.28,
    strengths: ["пехота", "обстрел с дистанции"],
    weaknesses: ["кавалерия", "ближний бой"],
  },
  cavalry: {
    label: "Кавалерия",
    description: "Быстрый ударный отряд, сметающий лучников при сближении.",
    unlockTownHall: 3,
    trainingBuilding: "stable",
    cost: r(12, 0, 35, 28, 72),
    trainingMs: 4_100,
    population: 2,
    maxHp: 205,
    damage: 29,
    armor: 6,
    speed: 78,
    attackIntervalMs: 1_100,
    range: 28,
    vision: 285,
    buildingDamageMultiplier: 0.38,
    strengths: ["лучники", "атака с разгона", "манёвренность"],
    weaknesses: ["пехота в защитном строю", "стены"],
  },
  catapult: {
    label: "Катапульта",
    description: "Медленная осадная машина с площадным уроном и бонусом по зданиям.",
    unlockTownHall: 4,
    trainingBuilding: "siegeWorkshop",
    cost: r(95, 70, 55, 60, 45),
    trainingMs: 6_200,
    population: 3,
    maxHp: 165,
    damage: 52,
    armor: 1,
    speed: 31,
    attackIntervalMs: 2_600,
    range: 245,
    vision: 270,
    buildingDamageMultiplier: 2.7,
    strengths: ["здания", "плотные группы", "стены"],
    weaknesses: ["ближний бой", "кавалерия", "скорость"],
  },
};

export const FORMATION_CONFIG: Readonly<Record<Formation, FormationConfig>> = {
  line: {
    label: "Линия",
    damageMultiplier: 1.06,
    armorMultiplier: 0.98,
    speedMultiplier: 1,
    rangedDamageTakenMultiplier: 1,
    cavalryDamageTakenMultiplier: 1,
    siegeProtectionMultiplier: 1,
  },
  defensive: {
    label: "Защитный строй",
    damageMultiplier: 0.9,
    armorMultiplier: 1.25,
    speedMultiplier: 0.78,
    rangedDamageTakenMultiplier: 0.92,
    cavalryDamageTakenMultiplier: 0.65,
    siegeProtectionMultiplier: 1,
  },
  wedge: {
    label: "Клин",
    damageMultiplier: 1.2,
    armorMultiplier: 0.9,
    speedMultiplier: 1.08,
    rangedDamageTakenMultiplier: 1.05,
    cavalryDamageTakenMultiplier: 1,
    siegeProtectionMultiplier: 1,
  },
  loose: {
    label: "Свободное построение",
    damageMultiplier: 0.96,
    armorMultiplier: 0.94,
    speedMultiplier: 1.12,
    rangedDamageTakenMultiplier: 0.84,
    cavalryDamageTakenMultiplier: 1.08,
    siegeProtectionMultiplier: 0.9,
  },
  protectSiege: {
    label: "Защита катапульт",
    damageMultiplier: 0.92,
    armorMultiplier: 1.12,
    speedMultiplier: 0.82,
    rangedDamageTakenMultiplier: 0.94,
    cavalryDamageTakenMultiplier: 0.8,
    siegeProtectionMultiplier: 0.55,
  },
};

const researchCosts = (base: ResourceAmounts): readonly ResourceAmounts[] => [
  base,
  r(base.wood * 1.55, base.stone * 1.55, base.gold * 1.55, base.iron * 1.55, base.food * 1.55),
  r(base.wood * 2.25, base.stone * 2.25, base.gold * 2.25, base.iron * 2.25, base.food * 2.25),
];

const research = (
  label: string,
  description: string,
  unlockTownHall: 1 | 2 | 3 | 4,
  requiresForge: boolean,
  baseCost: ResourceAmounts,
  effectPerLevel: number,
): ResearchConfig => ({
  label,
  description,
  unlockTownHall,
  requiresForge,
  maxLevel: 3,
  costs: researchCosts(baseCost),
  timesMs: [4_000, 6_500, 9_000],
  effectPerLevel,
});

export const RESEARCH_CONFIG: Readonly<Record<ResearchType, ResearchConfig>> = {
  infantryDamage: research("Закалённые клинки", "Урон пехоты", 3, true, r(80, 30, 70, 55, 30), 0.1),
  armor: research("Слоёная броня", "Броня всех войск", 3, true, r(60, 60, 70, 70, 25), 0.09),
  arrowDamage: research("Оперённые стрелы", "Урон лучников", 3, true, r(90, 20, 65, 35, 30), 0.1),
  archerRange: research("Дальнобойные луки", "Дальность лучников", 3, true, r(80, 30, 75, 25, 35), 0.07),
  cavalryHealth: research("Боевые кони", "Здоровье кавалерии", 3, true, r(70, 30, 90, 55, 70), 0.1),
  cavalrySpeed: research("Лёгкая сбруя", "Скорость кавалерии", 3, true, r(80, 20, 80, 40, 65), 0.08),
  squadSpeed: research("Походная дисциплина", "Скорость всех отрядов", 3, false, r(90, 45, 85, 25, 60), 0.06),
  catapultDamage: research("Противовесы", "Урон катапульт", 4, true, r(120, 100, 110, 90, 40), 0.12),
  buildingDamage: research("Осадное ремесло", "Урон по зданиям", 4, true, r(110, 100, 120, 80, 40), 0.12),
  trainingSpeed: research("Строевая подготовка", "Скорость обучения", 2, false, r(80, 30, 60, 20, 70), 0.08),
  woodProduction: research("Стальные пилы", "Добыча дерева", 2, false, r(90, 35, 35, 15, 40), 0.12),
  stoneProduction: research("Горное дело", "Добыча камня", 2, false, r(70, 60, 40, 20, 40), 0.12),
  goldProduction: research("Глубокие штольни", "Добыча золота", 3, false, r(80, 80, 70, 30, 50), 0.12),
  ironProduction: research("Рудные жилы", "Добыча железа", 3, false, r(80, 80, 60, 45, 50), 0.12),
  foodProduction: research("Севооборот", "Производство еды", 2, false, r(75, 25, 35, 10, 60), 0.12),
  storageCapacity: research("Складская логистика", "Вместимость склада", 2, false, r(100, 70, 45, 15, 35), 0.15),
  populationCapacity: research("Городские кварталы", "Максимум населения", 2, false, r(100, 55, 50, 15, 70), 0.1),
  healingSpeed: research("Полевая медицина", "Скорость лечения", 3, true, r(80, 50, 90, 30, 100), 0.15),
};

export const MARKET_VALUES: Readonly<Record<ResourceKind, number>> = {
  wood: 1,
  stone: 1.2,
  gold: 2.4,
  iron: 2,
  food: 0.85,
};

export const MARKET_RETURN_RATIO = 0.72;

export const BUILDING_UNLOCKS: Readonly<Record<1 | 2 | 3 | 4, readonly BuildingType[]>> = {
  1: ["townHall", "sawmill", "farm", "house", "warehouse", "barracks", "wall"],
  2: ["quarry", "market", "archeryRange", "gate", "tower"],
  3: ["goldMine", "ironMine", "stable", "hospital", "forge"],
  4: ["siegeWorkshop"],
};
