import { AppError, notFound } from "../lib/errors.js";
import { resolveLanguage, translate } from "../lib/i18n.js";
import { logger } from "../lib/logger.js";

export function apiNotFound(req, _res, next) {
    next(notFound("errors.apiNotFound", { method: req.method, url: req.originalUrl }));
}

/** Validatsiya xatolaridagi maydon xabarlari ham kalit bo'lishi mumkin — ularni ham tarjima qilamiz */
const localizeDetails = (details, lang) =>
    Array.isArray(details) ? details.map((entry) => (entry?.message ? { ...entry, message: translate(lang, entry.message) } : entry)) : details;

/** Barcha xatolarni yagona JSON formatga keltiradi: { error: { code, message, details? } } */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
    if (res.headersSent) {
        res.end();
        return;
    }
    const lang = req.lang ?? resolveLanguage(req);

    if (error instanceof AppError) {
        res.status(error.status).json({
            error: {
                code: error.code,
                message: translate(lang, error.messageKey, error.params),
                details: localizeDetails(error.details, lang),
            },
        });
        return;
    }

    // express.json() xatolari
    if (error.type === "entity.too.large") {
        res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: translate(lang, "errors.payloadTooLarge") } });
        return;
    }
    if (error.type === "entity.parse.failed") {
        res.status(400).json({ error: { code: "BAD_JSON", message: translate(lang, "errors.badJson") } });
        return;
    }

    logger.error(`${req.method} ${req.originalUrl} — ${error.message}`, error.stack);
    res.status(500).json({ error: { code: "INTERNAL", message: translate(lang, "errors.internal") } });
}
