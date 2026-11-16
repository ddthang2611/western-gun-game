// Sliding window in-memory rate limiter with per-IP lockout buckets

interface LockoutRecord {
  count: number;
  lockedUntil: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private buckets: Map<string, Map<string, LockoutRecord>> = new Map();

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  private getBucket(bucketName: string): Map<string, LockoutRecord> {
    let bucket = this.buckets.get(bucketName);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(bucketName, bucket);
    }
    return bucket;
  }

  public isRateLimited(bucketName: string, ip: string): boolean {
    const bucket = this.getBucket(bucketName);
    const record = bucket.get(ip);
    if (!record) return false;
    if (record.lockedUntil > 0) {
      if (Date.now() < record.lockedUntil) return true;
      // Lock period expired, reset bucket record
      bucket.delete(ip);
      return false;
    }
    return false;
  }

  public getRemainingLockSeconds(bucketName: string, ip: string): number {
    const bucket = this.getBucket(bucketName);
    const record = bucket.get(ip);
    if (!record) return 0;
    const remaining = record.lockedUntil - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  public recordFailedAttempt(
    bucketName: string,
    ip: string,
    maxAttempts: number,
    lockDurationMs: number
  ): void {
    const bucket = this.getBucket(bucketName);
    const record = bucket.get(ip) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= maxAttempts) {
      record.lockedUntil = Date.now() + lockDurationMs;
    }
    bucket.set(ip, record);
  }

  public resetFailedAttempt(bucketName: string, ip: string): void {
    const bucket = this.getBucket(bucketName);
    bucket.delete(ip);
  }
}
