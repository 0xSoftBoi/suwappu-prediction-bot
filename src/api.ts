const API_BASE_URL = (process.env.SUWAPPU_API_URL ?? "https://api.suwappu.bot").replace(/\/$/, "");

async function get(path: string, params: Record<string, string | undefined> = {}): Promise<unknown> {
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
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Suwappu API error ${response.status}: ${text || response.statusText}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Current prediction-data endpoints that exist in suwappubot source but are
 * newer than the published @suwappu/sdk@0.4.x surface.
 */
export const predictionApi = {
  book: (marketId: string) =>
    get(`/v1/agent/predict/market/${encodeURIComponent(marketId)}/book`),
  price: (marketId: string) =>
    get(`/v1/agent/predict/market/${encodeURIComponent(marketId)}/price`),
  trades: (marketId: string, limit?: number) =>
    get(`/v1/agent/predict/market/${encodeURIComponent(marketId)}/trades`, {
      limit: limit?.toString(),
    }),
  positions: () => get("/v1/agent/predict/positions"),
  orders: (status?: string) => get("/v1/agent/predict/orders", { status }),
  events: (query?: string, limit?: number) =>
    get("/v1/agent/predict/events", {
      query,
      limit: limit?.toString(),
    }),
};
