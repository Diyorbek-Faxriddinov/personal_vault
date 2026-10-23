/**
 * Server API mijozi. Har bir so'rov JSON, CSRF sarlavhasi bilan, cookie orqali autentifikatsiya.
 * Xatolar ApiError ko'rinishida: { status, code, message, details }.
 */
import { Emitter } from "./events.js";
import { getLanguage, t } from "./i18n.js";

export class ApiError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

/** Har bir so'rovdagi sarlavhalar: CSRF himoyasi va server xabarlari qaysi tilda qaytishi */
export const apiHeaders = () => ({ "X-Vault-Request": "1", "X-Vault-Lang": getLanguage() });

/** "unauthorized" — sessiya tugaganda ilova login sahifasiga qaytadi */
export const apiEvents = new Emitter();

async function request(method, path, body, { signal, raw = false } = {}) {
    let response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            credentials: "same-origin",
            headers: {
                ...apiHeaders(),
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
        });
    } catch (error) {
        if (error.name === "AbortError") throw error;
        throw new ApiError(0, "NETWORK", t("api.network"));
    }

    if (raw && response.ok) return response;

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        /* JSON emas */
    }

    if (!response.ok) {
        const error = data?.error ?? {};
        if (response.status === 401 && !path.startsWith("/auth/")) apiEvents.emit("unauthorized");
        throw new ApiError(response.status, error.code ?? "HTTP_ERROR", error.message ?? t("api.serverError", { status: response.status }), error.details);
    }
    return data;
}

export const api = {
    get: (path, options) => request("GET", path, undefined, options),
    post: (path, body = {}, options) => request("POST", path, body, options),
    put: (path, body = {}, options) => request("PUT", path, body, options),
    delete: (path, body, options) => request("DELETE", path, body, options),
};
