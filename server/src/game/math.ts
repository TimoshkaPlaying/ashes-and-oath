import { RESOURCE_KINDS, UNIT_TYPES, type Point, type ResourceAmounts, type UnitCounts } from "@ashes/shared";

export const zeroResources = (): ResourceAmounts => ({ wood: 0, stone: 0, gold: 0, iron: 0, food: 0 });
export const zeroUnits = (): UnitCounts => ({ infantry: 0, archer: 0, cavalry: 0, catapult: 0 });

export const cloneResources = (value: Readonly<ResourceAmounts>): ResourceAmounts => ({
  wood: value.wood,
  stone: value.stone,
  gold: value.gold,
  iron: value.iron,
  food: value.food,
});

export const cloneUnits = (value: Readonly<UnitCounts>): UnitCounts => ({
  infantry: value.infantry,
  archer: value.archer,
  cavalry: value.cavalry,
  catapult: value.catapult,
});

export const multiplyResources = (value: Readonly<ResourceAmounts>, multiplier: number): ResourceAmounts => {
  const result = zeroResources();
  for (const kind of RESOURCE_KINDS) result[kind] = Math.floor(value[kind] * multiplier);
  return result;
};

export const addResources = (target: ResourceAmounts, value: Readonly<ResourceAmounts>): void => {
  for (const kind of RESOURCE_KINDS) target[kind] += value[kind];
};

export const subtractResources = (target: ResourceAmounts, value: Readonly<ResourceAmounts>): void => {
  for (const kind of RESOURCE_KINDS) target[kind] -= value[kind];
};

export const canAfford = (available: Readonly<ResourceAmounts>, cost: Readonly<ResourceAmounts>): boolean =>
  RESOURCE_KINDS.every((kind) => available[kind] + 1e-6 >= cost[kind]);

export const sumUnits = (counts: Readonly<UnitCounts>): number =>
  UNIT_TYPES.reduce((sum, unitType) => sum + counts[unitType], 0);

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const clampPoint = (point: Point, width: number, height: number): Point => ({
  x: Math.max(0, Math.min(width, point.x)),
  y: Math.max(0, Math.min(height, point.y)),
});

export const moveToward = (from: Point, to: Point, distanceToMove: number): Point => {
  const total = distance(from, to);
  if (total <= distanceToMove || total === 0) return { ...to };
  const ratio = distanceToMove / total;
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
};

export const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
