type RateState = {
  count: number;
  resetAt: number;
};

const state = new Map<string, RateState>();

export const checkRateLimit = (key: string, limit: number): boolean => {
  const now = Date.now();
  const current = state.get(key);
  if (!current || now > current.resetAt) {
    state.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= limit) {
    return false;
  }
  current.count += 1;
  return true;
};

export const getRateLimitRemaining = (key: string, limit: number): number => {
  const now = Date.now();
  const current = state.get(key);
  if (!current || now > current.resetAt) {
    return limit;
  }
  return Math.max(0, limit - current.count);
};
