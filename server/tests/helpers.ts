import { RESOURCE_KINDS, type GameCommand } from "@ashes/shared";
import { GameRoom } from "../src/game/GameRoom.js";
import type { MatchPlayerState } from "../src/game/model.js";

export interface TestClock {
  now: number;
}

export const createStartedRoom = (startAt = 10_000) => {
  const clock: TestClock = { now: startAt };
  const room = new GameRoom("ABCDE", () => clock.now);
  const first = room.addPlayer("socket-a", "Alice", clock.now).player;
  const second = room.addPlayer("socket-b", "Boris", clock.now).player;
  room.setReady(first.playerId, true, clock.now);
  room.setReady(second.playerId, true, clock.now);
  const match = room.getMatchState();
  if (!match) throw new Error("Match did not start");
  const firstState = match.players.get(first.playerId);
  const secondState = match.players.get(second.playerId);
  if (!firstState || !secondState) throw new Error("Match players are missing");
  room.drainEvents();
  return { room, clock, first, second, match, firstState, secondState };
};

export const fund = (player: MatchPlayerState, amount = 20_000): void => {
  for (const kind of RESOURCE_KINDS) player.resources[kind] = amount;
  player.populationCurrent = 200;
};

let commandCounter = 0;
export const issue = (
  room: GameRoom,
  playerId: string,
  type: GameCommand["type"],
  payload: unknown,
  now: number,
) => {
  const player = room.findPlayerById(playerId);
  if (!player) throw new Error("Player not found");
  commandCounter += 1;
  const command = {
    id: `test_command_${commandCounter}`,
    seq: player.lastCommandSeq + 1,
    type,
    payload,
  } as GameCommand;
  return room.handleCommand(playerId, command, now);
};

export const advance = (room: GameRoom, clock: TestClock, deltaMs: number): void => {
  clock.now += deltaMs;
  room.tick(clock.now);
};
