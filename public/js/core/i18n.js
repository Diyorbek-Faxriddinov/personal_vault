/**
 * Interfeys tili: ingliz (en), o'zbek (uz), rus (ru).
 *
 * t("nav.home") — joriy tildagi matn. Parametrlar: t("common.itemsCount", { count: 3 }) → "{count}" o'rniga 3.
 * Ko'plik shakllari: qiymat obyekt bo'lsa ({ one, few, many, other }), Intl.PluralRules bo'yicha tanlanadi.
 * Kalit joriy tilda bo'lmasa — inglizchasi, u ham bo'lmasa — kalitning o'zi qaytadi.
 *
 * Tanlov localStorage'da saqlanadi (maxfiy emas): kirish ekrani ham tanlangan tilda ochilishi uchun.
 * Saqlanmagan bo'lsa — brauzer tiliga qarab aniqlanadi. Modul Node'da ham ishlaydi (testlar uchun).
 */
import { Emitter } from "./events.js";
import en from "../locales/en.js";
import ru from "../locales/ru.js";
import uz from "../locales/uz.js";

export const LANGUAGES = [
    { code: "en", label: "English", locale: "en-US" },
    { code: "uz", label: "O'zbekcha", locale: "uz-Latn-UZ" },
    { code: "ru", label: "Русский", locale: "ru-RU" },
];
export const DEFAULT_LANGUAGE = "en";
export const DICTIONARIES = { en, uz, ru };

const STORAGE_KEY = "vault:lang";
const events = new Emitter();
const isBrowser = typeof document !== "undefined";
const supported = (code) => (code && code in DICTIONARIES ? code : null);

function detect() {
    if (!isBrowser) return DEFAULT_LANGUAGE;
    try {
        const saved = supported(localStorage.getItem(STORAGE_KEY));
        if (saved) return saved;
    } catch {
        /* localStorage bloklangan */
    }
    for (const tag of navigator.languages ?? [navigator.language]) {
        const code = supported(String(tag ?? "").slice(0, 2).toLowerCase());
        if (code) return code;
    }
    return DEFAULT_LANGUAGE;
}

let current = detect();
const pluralRules = new Map();

function pluralForm(count) {
    if (!pluralRules.has(current)) pluralRules.set(current, new Intl.PluralRules(locale()));
    return pluralRules.get(current).select(Number(count) || 0);
}

function lookup(key, lang) {
    return DICTIONARIES[lang]?.[key];
}

/** Joriy tildagi matn */
export function t(key, params = {}) {
    let value = lookup(key, current) ?? lookup(key, DEFAULT_LANGUAGE) ?? key;
    if (typeof value === "object") value = value[pluralForm(params.count)] ?? value.other;
    return value.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export const getLanguage = () => current;

/** Intl uchun BCP 47 lokal: "en-US", "uz-Latn-UZ", "ru-RU" */
export const locale = () => LANGUAGES.find((language) => language.code === current).locale;

function applyToDocument() {
    if (!isBrowser) return;
    document.documentElement.lang = current;
}

export function setLanguage(code) {
    const next = supported(code);
    if (!next || next === current) return;
    current = next;
    if (isBrowser) {
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            /* localStorage bloklangan */
        }
    }
    applyToDocument();
    events.emit("change", current);
}

/** Til o'zgarganda chaqiriladi; obunani bekor qiluvchi funksiya qaytaradi */
export const onLanguageChange = (listener) => events.on("change", listener);

applyToDocument();
