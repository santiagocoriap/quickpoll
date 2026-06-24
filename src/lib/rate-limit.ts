// Lightweight in-memory rate limiter. Good enough for a single-instance,
// small private deployment. For multi-instance, swap the store for Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count++;
  return { ok: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

// Periodically clear expired buckets to avoid unbounded growth.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.resetAt < now) store.delete(k);
  }, 60_000).unref?.();
}
