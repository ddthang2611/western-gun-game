"use strict";
// Utility to parse Cookie header into key-value map
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCookies = parseCookies;
exports.extractSessionToken = extractSessionToken;
const SET_COOKIE_ATTRS = new Set([
    "httponly",
    "secure",
    "samesite",
    "path",
    "domain",
    "max-age",
    "expires",
    "partitioned",
]);
function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function parseCookies(cookieHeader) {
    const cookies = Object.create(null);
    if (!cookieHeader || typeof cookieHeader !== "string")
        return cookies;
    for (const item of cookieHeader.split(";")) {
        const trimmed = item.trim();
        if (!trimmed)
            continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!key || key === "__proto__" || key === "constructor" || key === "prototype") {
            continue;
        }
        if (SET_COOKIE_ATTRS.has(key.toLowerCase())) {
            continue;
        }
        if (cookies[key] === undefined) {
            cookies[key] = safeDecode(val);
        }
    }
    return cookies;
}
// Extract token from raw value or Set-Cookie string
function extractSessionToken(rawToken) {
    if (typeof rawToken !== "string")
        return undefined;
    const trimmed = rawToken.trim();
    if (!trimmed)
        return undefined;
    if (trimmed.includes("session_token=")) {
        const parsed = parseCookies(trimmed).session_token;
        return parsed ? parsed.trim() : undefined;
    }
    return trimmed;
}
