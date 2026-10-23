/**
 * Mavzu: "system" | "light" | "dark". Tanlov shifrlangan sozlamalarda saqlanadi, lekin
 * qulflangan ekran ham to'g'ri ko'rinishi uchun localStorage'da nusxasi turadi (bu maxfiy emas).
 */
const CACHE_KEY = "vault:theme";

export function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme;
    try {
        localStorage.setItem(CACHE_KEY, theme);
    } catch {
        /* localStorage bloklangan */
    }
}

export function cachedTheme() {
    try {
        return localStorage.getItem(CACHE_KEY) ?? "system";
    } catch {
        return "system";
    }
}

export function effectiveTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit) return explicit;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
