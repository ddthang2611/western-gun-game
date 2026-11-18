"use strict";
// Sliding window in-memory rate limiter with per-IP lockout buckets
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
const DEFAULT_RECORD_TTL_MS = 15 * 60 * 1000;
const MAX_BUCKET_SIZE = 5000;
const PRUNE_INTERVAL_MS = 60 * 1000;
class RateLimiter {
    static instance;
    buckets = new Map();
    lastPruneAt = Date.now();
    constructor() {
        const sweepTimer = setInterval(() => {
            this.pruneAllBuckets(Date.now());
        }, 5 * 60 * 1000);
        sweepTimer.unref?.();
    }
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
    isRecordExpired(record, now) {
        if (record.lockedUntil > 0) {
            return now >= record.lockedUntil;
        }
        return now - record.lastAttemptAt > record.ttlMs;
    }
    pruneBucket(bucket, now) {
        for (const [ip, record] of bucket.entries()) {
            if (this.isRecordExpired(record, now)) {
                bucket.delete(ip);
            }
        }
    }
    pruneAllBuckets(now) {
        this.lastPruneAt = now;
        for (const bucket of this.buckets.values()) {
            this.pruneBucket(bucket, now);
        }
    }
    maybePrune(bucket, now) {
        if (now - this.lastPruneAt >= PRUNE_INTERVAL_MS) {
            this.pruneAllBuckets(now);
        }
        else if (bucket.size >= MAX_BUCKET_SIZE) {
            this.pruneBucket(bucket, now);
        }
    }
    isRateLimited(bucketName, ip) {
        const now = Date.now();
        const bucket = this.getBucket(bucketName);
        this.maybePrune(bucket, now);
        const record = bucket.get(ip);
        if (!record)
            return false;
        if (record.lockedUntil > 0) {
            if (now < record.lockedUntil)
                return true;
            // Lock period expired, reset bucket record
            bucket.delete(ip);
            return false;
        }
        if (now - record.lastAttemptAt > record.ttlMs) {
            bucket.delete(ip);
            return false;
        }
        return false;
    }
    getRemainingLockSeconds(bucketName, ip) {
        const now = Date.now();
        const bucket = this.getBucket(bucketName);
        const record = bucket.get(ip);
        if (!record)
            return 0;
        const remaining = record.lockedUntil - now;
        if (remaining <= 0) {
            if (this.isRecordExpired(record, now)) {
                bucket.delete(ip);
            }
            return 0;
        }
        return Math.ceil(remaining / 1000);
    }
    recordFailedAttempt(bucketName, ip, maxAttempts, lockDurationMs) {
        const now = Date.now();
        const bucket = this.getBucket(bucketName);
        this.maybePrune(bucket, now);
        const ttlMs = Math.max(lockDurationMs, DEFAULT_RECORD_TTL_MS);
        const existing = bucket.get(ip);
        const record = existing && !this.isRecordExpired(existing, now)
            ? existing
            : { count: 0, lockedUntil: 0, lastAttemptAt: now, ttlMs };
        record.count += 1;
        record.lastAttemptAt = now;
        record.ttlMs = ttlMs;
        if (record.count >= maxAttempts) {
            record.lockedUntil = now + lockDurationMs;
        }
        if (bucket.has(ip)) {
            bucket.delete(ip);
        }
        else if (bucket.size >= MAX_BUCKET_SIZE) {
            this.pruneBucket(bucket, now);
            while (bucket.size >= MAX_BUCKET_SIZE) {
                const oldestKey = bucket.keys().next().value;
                if (oldestKey === undefined)
                    break;
                bucket.delete(oldestKey);
            }
        }
        bucket.set(ip, record);
    }
    resetFailedAttempt(bucketName, ip) {
        const bucket = this.getBucket(bucketName);
        bucket.delete(ip);
    }
}
exports.RateLimiter = RateLimiter;
