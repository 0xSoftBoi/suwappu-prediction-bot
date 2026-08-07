type RecordLike = Record<string, unknown>;

export interface OutcomeHealth {
  outcome: string;
  tokenId: string;
  midpoint: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  bidDepthWithinOneCentShares: number | null;
  askDepthWithinOneCentShares: number | null;
  lastTradePrice: number | null;
}

export interface MarketHealthSnapshot {
  capturedAt: string;
  marketId: string;
  question: string;
  active: boolean | null;
  endDate: string | null;
  volume: number | null;
  liquidity: number | null;
  outcomes: OutcomeHealth[];
  recentTrades: {
    count: number;
    latestAt: string | null;
  };
  warnings: string[];
}

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finite(value: unknown, min = -Infinity, max = Infinity): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function levels(value: unknown): Array<{ price: number; size: number }> {
  return rows(value)
    .map((item) => record(item))
    .map((item) => ({
      price: finite(item.price, 0, 1),
      size: finite(item.size, 0),
    }))
    .filter(
      (item): item is { price: number; size: number } =>
        item.price !== null && item.size !== null,
    );
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function nearDepth(
  side: "bid" | "ask",
  entries: Array<{ price: number; size: number }>,
  best: number | null,
): number | null {
  if (best === null) return null;
  const threshold = side === "bid" ? best - 0.01 : best + 0.01;
  return rounded(
    entries
      .filter((entry) => (side === "bid" ? entry.price >= threshold : entry.price <= threshold))
      .reduce((sum, entry) => sum + entry.size, 0),
  );
}

/**
 * Normalize four read-only prediction responses into one copyable product datum.
 * The reads are not atomic; warnings surface obvious cross-read/book inconsistencies.
 */
export function buildMarketHealthSnapshot(
  detailValue: unknown,
  bookValue: unknown,
  pricesValue: unknown,
  tradesValue: unknown,
  capturedAt = new Date().toISOString(),
): MarketHealthSnapshot {
  const detail = record(detailValue);
  const book = record(bookValue);
  const prices = record(pricesValue);
  const trades = record(tradesValue);
  const priceRows = rows(prices.prices).map((row) => record(row));
  const outcomeBooks = rows(book.outcomes).map((row) => record(row));
  const warnings: string[] = [];

  const active = typeof detail.active === "boolean" ? detail.active : null;
  if (active === false) warnings.push("Market is not active.");
  if (outcomeBooks.length === 0) warnings.push("No outcome order books are currently available.");

  const outcomes = outcomeBooks.map((outcomeBook): OutcomeHealth => {
    const outcome = text(outcomeBook.outcome) || "Unknown";
    const tokenId = text(outcomeBook.tokenId);
    const bids = levels(outcomeBook.bids);
    const asks = levels(outcomeBook.asks);
    const bestBid = bids.length ? Math.max(...bids.map((entry) => entry.price)) : null;
    const bestAsk = asks.length ? Math.min(...asks.map((entry) => entry.price)) : null;
    const priceRow =
      priceRows.find((row) => tokenId && text(row.tokenId) === tokenId) ??
      priceRows.find((row) => text(row.outcome) === outcome);
    const midpoint = finite(priceRow?.mid ?? outcomeBook.midpoint, 0, 1);

    if (bestBid === null || bestAsk === null) {
      warnings.push(`${outcome}: top of book is incomplete.`);
    } else if (bestBid > bestAsk) {
      warnings.push(`${outcome}: best bid exceeds best ask.`);
    } else if (midpoint !== null && (midpoint < bestBid || midpoint > bestAsk)) {
      warnings.push(`${outcome}: midpoint falls outside the fetched top-of-book spread.`);
    }

    return {
      outcome,
      tokenId,
      midpoint,
      bestBid,
      bestAsk,
      spread: bestBid !== null && bestAsk !== null ? rounded(bestAsk - bestBid) : null,
      bidDepthWithinOneCentShares: nearDepth("bid", bids, bestBid),
      askDepthWithinOneCentShares: nearDepth("ask", asks, bestAsk),
      lastTradePrice: finite(outcomeBook.lastTradePrice, 0, 1),
    };
  });

  const tradeRows = rows(trades.trades).map((row) => record(row));
  const timestamps = tradeRows.map((row) => text(row.timestamp)).filter(Boolean).sort();

  return {
    capturedAt,
    marketId: text(detail.id) || text(book.marketId) || text(prices.marketId),
    question: text(detail.question) || text(book.question) || text(prices.question),
    active,
    endDate: text(detail.endDate) || null,
    volume: finite(detail.volume, 0),
    liquidity: finite(detail.liquidity, 0),
    outcomes,
    recentTrades: {
      count: tradeRows.length,
      latestAt: timestamps.length ? timestamps[timestamps.length - 1] : null,
    },
    warnings,
  };
}
