/**
 * Sana va vaqt formatlari joriy tilda.
 * Ingliz va rus tillari uchun brauzerning Intl API'si ishlatiladi; brauzerlarda "uz" lokali to'liq
 * bo'lmagani uchun o'zbekcha formatlarni o'zimiz yozamiz.
 */
import { getLanguage, locale, t } from "../core/i18n.js";
import { daysBetween, todayISO } from "../services/analytics.js";

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const UZ_WEEKDAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

const isUzbek = () => getLanguage() === "uz";
const intl = (options, date) => new Intl.DateTimeFormat(locale(), options).format(date);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const pad = (n) => String(n).padStart(2, "0");

const toDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value));

/** "23-oktabr, 2026" · "October 23, 2026" · "23 октября 2026 г." (joriy yil bo'lsa yilsiz) */
export function formatDate(value, { withYear = "auto" } = {}) {
    if (!value) return "";
    const d = toDate(value);
    const showYear = withYear === true || (withYear === "auto" && d.getFullYear() !== new Date().getFullYear());
    if (isUzbek()) return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}${showYear ? `, ${d.getFullYear()}` : ""}`;
    return intl({ day: "numeric", month: "long", ...(showYear ? { year: "numeric" } : {}) }, d);
}

export function formatDateTime(value) {
    if (!value) return "";
    const d = toDate(value);
    return `${formatDate(value)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Juma, 23-oktabr" · "Friday, October 23" · "Пятница, 23 октября" */
export function formatLongDate(date = new Date()) {
    if (isUzbek()) return `${UZ_WEEKDAYS[date.getDay()]}, ${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
    return capitalize(intl({ weekday: "long", day: "numeric", month: "long" }, date));
}

/** Oy va yil sarlavhasi (masalan, kundalik guruhlari uchun): "oktabr 2026" · "October 2026" · "Октябрь 2026 г." */
export function formatMonthYear(year, monthIndex) {
    if (isUzbek()) return `${UZ_MONTHS[monthIndex]} ${year}`;
    return capitalize(intl({ month: "long", year: "numeric" }, new Date(year, monthIndex, 1)));
}

/** Oyning qisqa nomi: "okt" · "Oct" · "окт." */
export function monthShort(monthIndex) {
    if (isUzbek()) return UZ_MONTHS_SHORT[monthIndex];
    return intl({ month: "short" }, new Date(2026, monthIndex, 1));
}

/** Hafta kunining qisqa nomi (0 = yakshanba): "Du" · "Mon" · "пн" */
export function weekdayShort(dayIndex) {
    if (isUzbek()) return UZ_WEEKDAYS_SHORT[dayIndex];
    // 2026-yil 4-yanvar — yakshanba
    return intl({ weekday: "short" }, new Date(2026, 0, 4 + dayIndex));
}

/** "hozirgina", "5 daqiqa oldin", "kecha", "3 kun oldin", ... */
export function relativeTime(value, now = new Date()) {
    if (!value) return "";
    const seconds = Math.round((now - new Date(value)) / 1000);
    if (seconds < 45) return t("time.justNow");
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t("time.minutesAgo", { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("time.hoursAgo", { count: hours });
    const days = Math.round(hours / 24);
    if (days === 1) return t("time.yesterday");
    if (days < 30) return t("time.daysAgo", { count: days });
    return formatDate(value);
}

/** Muddat yorlig'i: { text, tone } */
export function dueLabel(dueDate, today = todayISO()) {
    if (!dueDate) return null;
    const diff = daysBetween(today, dueDate);
    if (diff < -1) return { text: t("due.overdueDays", { count: -diff }), tone: "danger" };
    if (diff === -1) return { text: t("due.yesterday"), tone: "danger" };
    if (diff === 0) return { text: t("due.today"), tone: "primary" };
    if (diff === 1) return { text: t("due.tomorrow"), tone: "warning" };
    if (diff <= 7) return { text: t("due.inDays", { count: diff }), tone: "muted" };
    return { text: formatDate(dueDate), tone: "muted" };
}

export function greeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 5) return t("greeting.night");
    if (hour < 12) return t("greeting.morning");
    if (hour < 18) return t("greeting.day");
    return t("greeting.evening");
}

export function describeUserAgent(ua = "") {
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : t("common.browser");
    const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} · ${os}` : browser;
}

/** 1536 → "1.5 KB" */
export function formatBytes(bytes = 0) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = Number(bytes) || 0;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
