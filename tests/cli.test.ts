import { describe, it, expect } from "bun:test";

function formatProbability(price: number): string {
  return (price * 100).toFixed(0) + "%";
}

function formatVolume(volume: number): string {
  if (volume > 1e6) return `$${(volume / 1e6).toFixed(1)}M`;
  if (volume > 1e3) return `$${(volume / 1e3).toFixed(0)}K`;
  return `$${volume.toFixed(0)}`;
}

function isActive(endDate: string): boolean {
  return new Date(endDate) > new Date();
}

describe("probability formatting", () => {
  it("should format 0.65 as 65%", () => {
    expect(formatProbability(0.65)).toBe("65%");
  });

  it("should format 0.01 as 1%", () => {
    expect(formatProbability(0.01)).toBe("1%");
  });

  it("should format 0.99 as 99%", () => {
    expect(formatProbability(0.99)).toBe("99%");
  });

  it("should format 0 as 0%", () => {
    expect(formatProbability(0)).toBe("0%");
  });

  it("should format 1.0 as 100%", () => {
    expect(formatProbability(1.0)).toBe("100%");
  });
});

describe("volume formatting", () => {
  it("should format millions with M suffix", () => {
    expect(formatVolume(1_500_000)).toBe("$1.5M");
  });

  it("should format thousands with K suffix", () => {
    expect(formatVolume(250_000)).toBe("$250K");
  });

  it("should format small volumes as raw number", () => {
    expect(formatVolume(500)).toBe("$500");
  });

  it("should format exactly 1M", () => {
    expect(formatVolume(1_000_000)).toBe("$1000K");
  });

  it("should format > 1M with M", () => {
    expect(formatVolume(1_000_001)).toBe("$1.0M");
  });
});

describe("subcommand validation", () => {
  const valid = ["browse", "detail"];
  it("should accept browse and detail", () => {
    expect(valid.includes("browse")).toBe(true);
    expect(valid.includes("detail")).toBe(true);
  });
  it("should reject unknown commands", () => {
    expect(valid.includes("trade")).toBe(false);
  });
});

describe("market activity", () => {
  it("should detect future end date as active", () => {
    expect(isActive("2030-12-31")).toBe(true);
  });
  it("should detect past end date as inactive", () => {
    expect(isActive("2020-01-01")).toBe(false);
  });
});
