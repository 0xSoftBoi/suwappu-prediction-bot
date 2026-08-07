const API_BASE_URL = (process.env.SUWAPPU_API_URL ?? "https://api.suwappu.bot").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 30_000;

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

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }

  const response = await fetch(
    `${API_BASE_URL}${path}${search.size ? `?${search.toString()}` : ""}`,
    {
      headers: process.env.SUWAPPU_API_KEY
        ? { Authorization: `Bearer ${process.env.SUWAPPU_API_KEY}` }
        : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Suwappu API error ${response.status}: ${text || response.statusText}`);
  }
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Suwappu API returned invalid JSON for ${path}`);
  }
}

/**
 * Current prediction-data endpoints that exist in suwappubot source but are
 * newer than the published @suwappu/sdk@0.4.x surface.
 */
export const predictionApi = {
  book: (marketId: string) =>
    get<PredictionBook>(`/v1/agent/predict/market/${encodeURIComponent(marketId)}/book`),
  price: (marketId: string) =>
    get<PredictionPrices>(`/v1/agent/predict/market/${encodeURIComponent(marketId)}/price`),
  trades: (marketId: string, limit?: number) =>
    get<PredictionTrades>(`/v1/agent/predict/market/${encodeURIComponent(marketId)}/trades`, {
      limit: limit?.toString(),
    }),
  positions: () => get<unknown>("/v1/agent/predict/positions"),
  orders: (status?: string) => get<unknown>("/v1/agent/predict/orders", { status }),
  events: (query?: string, limit?: number) =>
    get<unknown>("/v1/agent/predict/events", {
      query,
      limit: limit?.toString(),
    }),
};
