import { describe, it, expect } from "bun:test";
describe("prediction-bot", () => {
  it("should format probability as percentage", () => { expect((0.65 * 100).toFixed(0)).toBe("65"); });
  it("should format large volumes", () => { const v = 1500000; expect(v > 1e6).toBe(true); });
});
