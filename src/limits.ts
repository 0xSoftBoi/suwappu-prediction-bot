export const MAX_READ_COUNT = 100;

export function parseReadCount(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`expected an integer from 1 to ${MAX_READ_COUNT}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_READ_COUNT) {
    throw new Error(`expected an integer from 1 to ${MAX_READ_COUNT}`);
  }
  return parsed;
}
