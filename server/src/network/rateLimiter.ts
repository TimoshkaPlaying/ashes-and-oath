export class SlidingWindowRateLimiter {
  private readonly requests = new Map<string, number[]>();

  public allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const cutoff = now - windowMs;
    const recent = (this.requests.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= limit) {
      this.requests.set(key, recent);
      return false;
    }
    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }

  public clear(key: string): void {
    this.requests.delete(key);
  }
}
