/**
 * HTTP yordamchilari: cookie, so'rov meta-ma'lumotlari.
 */
import { config } from "../config.js";

export function parseCookies(header = "") {
    const cookies = {};
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;
        const name = part.slice(0, index).trim();
        if (!name) continue;
        try {
            cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            /* buzilgan cookie — e'tiborsiz */
        }
    }
    return cookies;
}

const cookieOptions = () => ({
    httpOnly: true,
    sameSite: "strict",
    secure: config.isProduction,
    path: "/",
});

export function setSessionCookie(res, { token, expiresAt }) {
    res.cookie(config.session.cookieName, token, { ...cookieOptions(), expires: expiresAt });
}

export function clearSessionCookie(res) {
    res.clearCookie(config.session.cookieName, cookieOptions());
}

export const getSessionToken = (req) => parseCookies(req.headers.cookie)[config.session.cookieName] ?? null;

/** Audit va sessiyalar ro'yxati uchun */
export const requestMeta = (req) => ({
    ip: req.ip ?? null,
    userAgent: (req.get("user-agent") ?? "").slice(0, 255) || null,
});
