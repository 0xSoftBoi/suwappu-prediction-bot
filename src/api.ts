import { loadRuntimeConfig, requireApiKey, type RuntimeConfig } from "./config.js";

type RecordLike = Record<string, unknown>;

export interface PredictionMarketToken {
  tokenId: string;
  outcome: string;
}

export interface PredictionMarket {
  id: string;
  conditionId?: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  tokens: PredictionMarketToken[];
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  category: string;
}

export interface PredictionMarketDetail extends PredictionMarket {
  description: string;
  createdAt: string;
  resolvedOutcome: string | null;
}

export interface PredictionBookLevel {
  price: string;
  size: string;
}

export interface PredictionOutcomeBook {
  outcome: string;
  tokenId: string;
  bids?: PredictionBookLevel[];
  asks?: PredictionBookLevel[];
  midpoint?: string;
  lastTradePrice?: string;
  tickSize?: string;
}

export interface PredictionBook {
  marketId: string;
  question: string;
  outcomes: PredictionOutcomeBook[];
}

export interface PredictionPriceRow {
  outcome: string;
  tokenId: string;
  mid: string;
}

export interface PredictionPrices {
  marketId: string;
  question: string;
  prices: PredictionPriceRow[];
}

export interface PredictionTrade {
  id?: string;
  price?: string;
  size?: string;
  side?: string;
  timestamp?: string;
  outcome?: string;
  tokenId?: string;
}

export interface PredictionTrades {
  marketId: string;
  question: string;
  trades: PredictionTrade[];
}

export class SuwappuReadError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "SuwappuReadError";
  }
}

function record(value: unknown, label: string): RecordLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SuwappuReadError(`Suwappu API returned an invalid ${label} response`, null);
  }
  return value as RecordLike;
}

function arrayField(root: RecordLike, field: string, label: string): unknown[] {
  if (!Array.isArray(root[field])) {
    throw new SuwappuReadError(`Suwappu API returned an invalid ${label} response`, null);
  }
  return root[field] as unknown[];
}

function emitApiEvent(
  config: RuntimeConfig,
  operation: string,
  outcome: "ok" | "retry" | "error",
  attempt: number,
  startedAt: number,
  status: number | null,
): void {
  if (!config.apiEvents) return;
  console.error(
    JSON.stringify({
      event: "suwappu.api",
      operation,
      outcome,
      attempt,
      durationMs: Date.now() - startedAt,
      status,
    }),
  );
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 5_000);
    const when = Date.parse(retryAfter);
    if (Number.isFinite(when)) return Math.min(Math.max(when - Date.now(), 0), 5_000);
  }
  return Math.min(250 * 2 ** (attempt - 1), 2_000);
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function pause(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(
  operation: string,
  path: string,
  params: Record<string, string | undefined> = {},
  authenticated = false,
): Promise<unknown> {
  const config = loadRuntimeConfig();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const apiKey = authenticated ? requireApiKey(config) : config.apiKey;
  const url = `${config.apiBaseUrl}${path}${search.size ? `?${search.toString()}` : ""}`;

  for (let attempt = 1; attempt <= config.readRetries + 1; attempt += 1) {
    const startedAt = Date.now();
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
    } catch {
      const shouldRetry = attempt <= config.readRetries;
      emitApiEvent(config, operation, shouldRetry ? "retry" : "error", attempt, startedAt, null);
      if (shouldRetry) {
        await pause(retryDelay(null, attempt));
        continue;
      }
      throw new SuwappuReadError(
        `Suwappu API ${operation} request failed after ${attempt} attempt${attempt === 1 ? "" : "s"}`,
        null,
      );
    }

    if (!response.ok) {
      const shouldRetry = retryableStatus(response.status) && attempt <= config.readRetries;
      emitApiEvent(
        config,
        operation,
        shouldRetry ? "retry" : "error",
        attempt,
        startedAt,
        response.status,
      );
      if (shouldRetry) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new SuwappuReadError(
        `Suwappu API ${operation} failed with HTTP ${response.status}`,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      emitApiEvent(config, operation, "error", attempt, startedAt, response.status);
      throw new SuwappuReadError(`Suwappu API returned invalid JSON for ${operation}`, response.status);
    }
    emitApiEvent(config, operation, "ok", attempt, startedAt, response.status);
    return payload;
  }

  throw new SuwappuReadError(`Suwappu API ${operation} request failed`, null);
}

/**
 * Explicitly read-only Suwappu prediction surface. Market research calls do not
 * require an API key; positions/orders are account-scoped and do.
 */
export const predictionApi = {
  markets: async (query?: string, limit?: number): Promise<PredictionMarket[]> => {
    const root = record(
      await getJson("predict.markets", "/v1/agent/predict/markets", {
        query,
        limit: limit?.toString(),
      }),
      "market-list",
    );
    return arrayField(root, "markets", "market-list") as PredictionMarket[];
  },
  market: async (marketId: string): Promise<PredictionMarketDetail> =>
    record(
      await getJson(
        "predict.market",
        `/v1/agent/predict/market/${encodeURIComponent(marketId)}`,
      ),
      "market-detail",
    ) as unknown as PredictionMarketDetail,
  book: async (marketId: string): Promise<PredictionBook> => {
    const root = record(
      await getJson(
        "predict.book",
        `/v1/agent/predict/market/${encodeURIComponent(marketId)}/book`,
      ),
      "order-book",
    );
    arrayField(root, "outcomes", "order-book");
    return root as unknown as PredictionBook;
  },
  price: async (marketId: string): Promise<PredictionPrices> => {
    const root = record(
      await getJson(
        "predict.price",
        `/v1/agent/predict/market/${encodeURIComponent(marketId)}/price`,
      ),
      "price",
    );
    arrayField(root, "prices", "price");
    return root as unknown as PredictionPrices;
  },
  trades: async (marketId: string, limit?: number): Promise<PredictionTrades> => {
    const root = record(
      await getJson(
        "predict.trades",
        `/v1/agent/predict/market/${encodeURIComponent(marketId)}/trades`,
        { limit: limit?.toString() },
      ),
      "trades",
    );
    arrayField(root, "trades", "trades");
    return root as unknown as PredictionTrades;
  },
  positions: async (): Promise<unknown[]> => {
    const root = record(
      await getJson("predict.positions", "/v1/agent/predict/positions", {}, true),
      "positions",
    );
    return arrayField(root, "positions", "positions");
  },
  orders: async (status?: string): Promise<unknown[]> => {
    const value = await getJson("predict.orders", "/v1/agent/predict/orders", { status }, true);
    if (Array.isArray(value)) return value;
    return arrayField(record(value, "orders"), "orders", "orders");
  },
  events: async (query?: string, limit?: number): Promise<unknown[]> => {
    const root = record(
      await getJson("predict.events", "/v1/agent/predict/events", {
        query,
        limit: limit?.toString(),
      }),
      "events",
    );
    return arrayField(root, "events", "events");
  },
};
