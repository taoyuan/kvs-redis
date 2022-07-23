export const random = {
  string(len?: number) {
    len = len ?? 8;
    const chars = 'abcdefghiklmnopqrstuvwxyz';
    let str = '';
    for (let i = 0; i < len; i++) {
      const n = Math.floor(Math.random() * chars.length);
      str += chars.substring(n, n + 1);
    }
    return str;
  },
};

export function assertBetween(actual: number, lower: number, upper: number) {
  expect(actual).toBeGreaterThanOrEqual(lower);
  expect(actual).toBeLessThanOrEqual(upper);
}

export function assertWithin(actual: number, expected: number, delta: number) {
  const lower = expected - delta;
  const upper = expected + delta;
  assertBetween(actual, lower, upper);
}
