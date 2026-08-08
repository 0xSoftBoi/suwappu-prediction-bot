import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface WatchStateEntry {
  triggered: boolean;
  lastAlertAt: string | null;
  lastObservedAt: string;
}

export interface WatchState {
  version: 1;
  watches: Record<string, WatchStateEntry>;
}

function stateDirectory(): string {
  const raw = process.env.SUWAPPU_PREDICTION_STATE_DIR ?? ".suwappu-prediction";
  if (!raw.trim()) throw new Error("SUWAPPU_PREDICTION_STATE_DIR must not be empty");
  return resolve(raw);
}

function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

function statePath(): string {
  return resolve(stateDirectory(), "watch-state.json");
}

function lockPath(): string {
  return resolve(stateDirectory(), "watch.lock");
}

function validEntry(value: unknown): value is WatchStateEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.triggered === "boolean" &&
    (row.lastAlertAt === null || typeof row.lastAlertAt === "string") &&
    typeof row.lastObservedAt === "string"
  );
}

export function loadWatchState(): WatchState {
  const path = statePath();
  if (!existsSync(path)) return { version: 1, watches: {} };

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Prediction watch state is unreadable or invalid JSON: ${path}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Prediction watch state has an invalid shape: ${path}`);
  }
  const root = value as Record<string, unknown>;
  if (root.version !== 1 || !root.watches || typeof root.watches !== "object" || Array.isArray(root.watches)) {
    throw new Error(`Prediction watch state has an unsupported schema: ${path}`);
  }
  for (const entry of Object.values(root.watches as Record<string, unknown>)) {
    if (!validEntry(entry)) throw new Error(`Prediction watch state contains an invalid entry: ${path}`);
  }
  chmodSync(path, 0o600);
  return value as WatchState;
}

export function saveWatchState(state: WatchState): void {
  const path = statePath();
  ensurePrivateDirectory(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let fd: number | null = null;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporary, path);
    chmodSync(path, 0o600);

    try {
      const directoryFd = openSync(dirname(path), "r");
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    } catch {
      // Some filesystems do not allow directory fsync; the file itself is durable.
    }
  } finally {
    if (fd !== null) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export interface StateLock {
  release(): void;
}

export function acquireStateLock(): StateLock {
  const directory = stateDirectory();
  ensurePrivateDirectory(directory);
  const path = lockPath();
  const token = `${process.pid}:${randomUUID()}`;
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(
        `Another prediction watch process owns ${path}; stop it or inspect the lock before retrying`,
      );
    }
    throw error;
  }
  try {
    writeFileSync(fd, `${token}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  let released = false;
  return {
    release(): void {
      if (released) return;
      released = true;
      try {
        if (readFileSync(path, "utf8").trim() === token) unlinkSync(path);
      } catch {
        // Never delete a lock whose ownership cannot be proven.
      }
    },
  };
}
