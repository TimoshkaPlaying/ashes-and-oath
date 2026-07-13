import {
  BEHAVIORS,
  BUILDING_TYPES,
  FORMATIONS,
  RESEARCH_TYPES,
  RESOURCE_KINDS,
  UNIT_TYPES,
} from "@ashes/shared";
import { z } from "zod";

const displayName = z.string().trim().min(2).max(24);
const roomName = z.string().trim().min(2).max(40);
const roomPassword = z.string().trim().min(4).max(48);
const roomCode = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{5}$/);
const entityId = z.string().min(1).max(80);
const commandId = z.string().min(6).max(80).regex(/^[A-Za-z0-9_:-]+$/);
const point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const unitCounts = z
  .object({
    infantry: z.number().int().min(0).max(100),
    archer: z.number().int().min(0).max(100),
    cavalry: z.number().int().min(0).max(100),
    catapult: z.number().int().min(0).max(100),
  })
  .strict();

export const roomCreateSchema = z
  .object({
    displayName,
    roomName,
    visibility: z.enum(["public", "private"]),
    maxPlayers: z.literal(2),
    password: roomPassword.optional(),
  })
  .strict();
export const roomJoinSchema = z
  .object({ code: roomCode, displayName, password: z.string().trim().max(48).optional() })
  .strict();
export const roomResumeSchema = z
  .object({ code: roomCode, reconnectToken: z.string().min(8).max(120) })
  .strict();
export const lobbyUpdateSchema = z
  .object({
    customization: z
      .object({
        kingdomName: z.string().trim().min(2).max(28).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        flag: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
        emblem: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
      })
      .strict(),
  })
  .strict();
export const lobbyReadySchema = z.object({ ready: z.boolean() }).strict();
export const lobbyRoomSettingsSchema = z
  .object({
    name: roomName.optional(),
    visibility: z.enum(["public", "private"]).optional(),
    password: z.string().trim().max(48).optional(),
  })
  .strict();
export const lobbyPlayerActionSchema = z.object({ playerId: z.string().min(1).max(80) }).strict();
export const rematchSchema = z.object({ want: z.boolean() }).strict();
export const pingSchema = z.object({ clientTime: z.number().finite() }).strict();

const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("position"), position: point }).strict(),
  z.object({ kind: z.literal("enemySquad"), squadId: entityId }).strict(),
  z.object({ kind: z.literal("enemyBuilding"), buildingId: entityId }).strict(),
  z.object({ kind: z.literal("enemyBase") }).strict(),
  z.object({ kind: z.literal("defendBase") }).strict(),
  z.object({ kind: z.literal("home") }).strict(),
]);

const base = { id: commandId, seq: z.number().int().positive().max(1_000_000_000) };

export const gameCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("building:construct"),
      payload: z.object({ buildingType: z.enum(BUILDING_TYPES), position: point.optional() }).strict(),
    })
    .strict(),
  z
    .object({ ...base, type: z.literal("building:upgrade"), payload: z.object({ buildingId: entityId }).strict() })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("training:queue"),
      payload: z
        .object({ buildingId: entityId, unitType: z.enum(UNIT_TYPES), count: z.number().int().min(1).max(12) })
        .strict(),
    })
    .strict(),
  z
    .object({ ...base, type: z.literal("training:cancel"), payload: z.object({ queueId: entityId }).strict() })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("market:trade"),
      payload: z
        .object({ sell: z.enum(RESOURCE_KINDS), buy: z.enum(RESOURCE_KINDS), amount: z.number().int().min(1).max(10_000) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("research:start"),
      payload: z.object({ researchType: z.enum(RESEARCH_TYPES) }).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("squad:create"),
      payload: z
        .object({
          name: z.string().trim().min(1).max(24),
          composition: unitCounts,
          formation: z.enum(FORMATIONS),
          behavior: z.enum(BEHAVIORS),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("squad:move"),
      payload: z.object({ squadId: entityId, destination: point, route: z.array(point).max(8).optional() }).strict(),
    })
    .strict(),
  z
    .object({ ...base, type: z.literal("squad:target"), payload: z.object({ squadId: entityId, target }).strict() })
    .strict(),
  z.object({ ...base, type: z.literal("squad:stop"), payload: z.object({ squadId: entityId }).strict() }).strict(),
  z.object({ ...base, type: z.literal("squad:retreat"), payload: z.object({ squadId: entityId }).strict() }).strict(),
  z
    .object({
      ...base,
      type: z.literal("squad:merge"),
      payload: z.object({ sourceSquadId: entityId, targetSquadId: entityId }).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("squad:split"),
      payload: z
        .object({
          squadId: entityId,
          name: z.string().trim().min(1).max(24),
          composition: unitCounts,
          formation: z.enum(FORMATIONS),
          behavior: z.enum(BEHAVIORS),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ ...base, type: z.literal("squad:hospitalize"), payload: z.object({ squadId: entityId }).strict() })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("gate:set"),
      payload: z.object({ buildingId: entityId, open: z.boolean() }).strict(),
    })
    .strict(),
]);
