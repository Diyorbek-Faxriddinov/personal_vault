/**
 * So'rovlar sonini cheklash: parolni tanlab ko'rish (brute-force) va suiiste'mollikdan himoya.
 */
import { rateLimit } from "express-rate-limit";
import { config } from "../config.js";
import { resolveLanguage, translate } from "../lib/i18n.js";

const handler = (req, res, _next, options) =>
    res.status(options.statusCode).json({
        error: { code: "TOO_MANY_REQUESTS", message: translate(req.lang ?? resolveLanguage(req), "errors.tooManyRequests") },
    });

const common = { standardHeaders: "draft-8", legacyHeaders: false, handler };

/** Kirish, ro'yxat va tiklash: IP bo'yicha 15 daqiqada 30 ta urinish */
export const authLimiter = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 10_000 : 30,
});

/** Umumiy API: IP bo'yicha 15 daqiqada 3000 ta so'rov */
export const apiLimiter = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 100_000 : 3000,
});

/** AI maslahatchi: foydalanuvchi bo'yicha soatiga 40 ta so'rov (pullik API) */
export const aiLimiter = rateLimit({
    ...common,
    windowMs: 60 * 60 * 1000,
    limit: 40,
    keyGenerator: (req) => `user:${req.session.userId}`,
});
