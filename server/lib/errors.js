/**
 * Ilova xatoliklari. Controller va service'lar shu klasslarni tashlaydi,
 * error-handler middleware ularni to'g'ri HTTP javobga aylantiradi.
 *
 * Xabar — lib/i18n.js dagi kalit (masalan, "errors.invalidLogin"); foydalanuvchiga u so'rov tilida
 * qaytariladi, `message` esa loglar uchun ingliz tilida.
 */
import { DEFAULT_LANGUAGE, translate } from "./i18n.js";

export class AppError extends Error {
    constructor(status, code, messageKey, details = undefined, params = undefined) {
        super(translate(DEFAULT_LANGUAGE, messageKey, params));
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.messageKey = messageKey;
        this.params = params;
        this.details = details;
    }
}

export const badRequest = (key = "errors.invalidRequest", details) => new AppError(400, "BAD_REQUEST", key, details);
export const unauthorized = (key = "errors.unauthorized") => new AppError(401, "UNAUTHORIZED", key);
export const forbidden = (key = "errors.forbidden") => new AppError(403, "FORBIDDEN", key);
export const notFound = (key = "errors.notFound", params) => new AppError(404, "NOT_FOUND", key, undefined, params);
export const conflict = (key, details) => new AppError(409, "CONFLICT", key, details);
export const tooLarge = (key, params) => new AppError(413, "PAYLOAD_TOO_LARGE", key, undefined, params);
export const unavailable = (key) => new AppError(503, "UNAVAILABLE", key);
