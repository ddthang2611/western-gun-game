"use strict";
// Utility to parse Cookie header into key-value map
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCookies = parseCookies;
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader)
        return cookies;
    for (const item of cookieHeader.split(";")) {
        const [k, ...v] = item.trim().split("=");
        if (k)
            cookies[k] = decodeURIComponent(v.join("="));
    }
    return cookies;
}
