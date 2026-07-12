import {
  BUILDING_CONFIG,
  BUILDING_TYPES,
  RESEARCH_CONFIG,
  RESEARCH_TYPES,
  RESOURCE_KINDS,
  UNIT_CONFIG,
  UNIT_TYPES,
} from "@ashes/shared";
import { describe, expect, it } from "vitest";

describe("shared balance contract", () => {
  it("defines every one of the 18 functional buildings with cost, timing, health and unlocks", () => {
    expect(BUILDING_TYPES).toHaveLength(18);
    expect(new Set(BUILDING_TYPES).size).toBe(18);
    const functions = new Set<string>();
    for (const type of BUILDING_TYPES) {
      const config = BUILDING_CONFIG[type];
      functions.add(config.function);
      expect(config.description.length).toBeGreaterThan(10);
      expect(config.unlockTownHall).toBeGreaterThanOrEqual(1);
      expect(config.unlockTownHall).toBeLessThanOrEqual(4);
      expect(config.levels.length).toBeGreaterThan(0);
      for (const level of config.levels) {
        expect(level.maxHp).toBeGreaterThan(0);
        expect(level.timeMs).toBeGreaterThanOrEqual(0);
        for (const resource of RESOURCE_KINDS) expect(level.cost[resource]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(functions).toEqual(
      new Set(["townHall", "production", "population", "storage", "trade", "healing", "training", "research", "defense", "gate", "tower"]),
    );
  });

  it("defines four distinct units and all 18 multi-level research paths", () => {
    expect(UNIT_TYPES).toHaveLength(4);
    for (const type of UNIT_TYPES) {
      const unit = UNIT_CONFIG[type];
      expect(unit.maxHp).toBeGreaterThan(0);
      expect(unit.damage).toBeGreaterThan(0);
      expect(unit.trainingMs).toBeGreaterThanOrEqual(1_000);
      expect(unit.population).toBeGreaterThan(0);
    }
    expect(RESEARCH_TYPES).toHaveLength(18);
    for (const type of RESEARCH_TYPES) {
      expect(RESEARCH_CONFIG[type].maxLevel).toBe(3);
      expect(RESEARCH_CONFIG[type].costs).toHaveLength(3);
      expect(RESEARCH_CONFIG[type].timesMs).toHaveLength(3);
      expect(RESEARCH_CONFIG[type].effectPerLevel).toBeGreaterThan(0);
    }
  });
});
