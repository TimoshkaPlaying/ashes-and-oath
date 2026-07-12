import type { RoomErrorCode } from "@ashes/shared";

export class RoomActionError extends Error {
  public readonly code: RoomErrorCode;

  public constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.name = "RoomActionError";
    this.code = code;
  }
}
