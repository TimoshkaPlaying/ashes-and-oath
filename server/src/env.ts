import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";

loadDotEnv({ path: resolve(process.cwd(), ".env"), override: false });
loadDotEnv({ path: resolve(process.cwd(), "..", ".env"), override: false });

const positivePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
};

export const env = {
  port: positivePort(process.env.PORT, 3_001),
  host: process.env.HOST?.trim() || "0.0.0.0",
  clientOrigins: (process.env.CLIENT_ORIGIN || (process.env.NODE_ENV === "production" ? "*" : "http://localhost:5173,http://127.0.0.1:5173"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV || "development",
  stateFile: process.env.STATE_FILE?.trim() || ((process.env.NODE_ENV || "development") === "test"
    ? null
    : resolve(process.cwd(), ".data", "rooms.json")),
} as const;
