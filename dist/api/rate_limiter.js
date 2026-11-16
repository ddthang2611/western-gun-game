"use strict";
// Sliding window in-memory rate limiter with per-IP lockout buckets
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
class RateLimiter {
    static instance;
    buckets = new Map();
    static getInstance() {
        if (!RateLimiter.instance) {
            RateLimiter.instance = new RateLimiter();
        }
        return RateLimiter.instance;
    }
    getBucket(bucketName) {
        let bucket = this.buckets.get(bucketName);
        if (!bucket) {
            bucket = new Map();
            this.buckets.set(bucketName, bucket);
        }
        return bucket;
    }
    isRateLimited(bucketName, ip) {
        const bucket = this.getBucket(bucketName);
        const record = bucket.get(ip);
        if (!record)
            return false;
        if (record.lockedUntil > 0) {
            if (Date.now() < record.lockedUntil)
                return true;
            // Lock period expired, reset bucket record
            bucket.delete(ip);
            return false;
        }
        return false;
    }
    getRemainingLockSeconds(bucketName, ip) {
        const bucket = this.getBucket(bucketName);
        const record = bucket.get(ip);
        if (!record)
            return 0;
        const remaining = record.lockedUntil - Date.now();
        return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    }
    recordFailedAttempt(bucketName, ip, maxAttempts, lockDurationMs) {
        const bucket = this.getBucket(bucketName);
        const record = bucket.get(ip) || { count: 0, lockedUntil: 0 };
        record.count += 1;
        if (record.count >= maxAttempts) {
            record.lockedUntil = Date.now() + lockDurationMs;
        }
        bucket.set(ip, record);
    }
    resetFailedAttempt(bucketName, ip) {
        const bucket = this.getBucket(bucketName);
        bucket.delete(ip);
    }
}
exports.RateLimiter = RateLimiter;
