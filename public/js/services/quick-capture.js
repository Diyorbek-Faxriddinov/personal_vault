/**
 * Tezkor yozish tahlilchisi: bitta qatordan yozuv yaratadi.
 *
 *   "Hisobotni topshirish ertaga !! #ish"   → vazifa, muddat ertaga, shoshilinch, teg "ish"
 *   "https://developer.mozilla.org #js"     → havola, teg "js"
 *   "fikr: yangi loyiha g'oyasi"            → eslatma
 *   "Dushanba kuni kitob o'qish"            → vazifa, muddat — eng yaqin dushanba
 *
 * Kalit so'zlar uch tilda ham tushuniladi (interfeys tilidan qat'i nazar):
 *   "Report tomorrow ! #work", "Отчёт завтра !! #работа", "note: idea", "задача: купить хлеб".
 */
import { addDays, todayISO } from "./analytics.js";

/** So'z chegarasi: \b faqat lotin harflarini tushunadi, kirill uchun Unicode harflari bilan tekshiramiz */
const word = (alternatives) => new RegExp(`(?<![\\p{L}\\d])(?:${alternatives})(?![\\p{L}\\d])`, "u");

/** Indeks — Date.getDay(): 0 = yakshanba */
const WEEKDAYS = [
    "yakshanba|sunday|воскресенье",
    "dushanba|monday|понедельник",
    "seshanba|tuesday|вторник",
    "chorshanba|wednesday|среда|среду",
    "payshanba|thursday|четверг",
    "juma|friday|пятница|пятницу",
    "shanba|saturday|суббота|субботу",
].map(word);
const TODAY = word("bugun|today|сегодня");
const DAY_AFTER_TOMORROW = word("indinga|day after tomorrow|послезавтра");
const TOMORROW = word("ertaga|tomorrow|завтра");

const PREFIXES = {
    note: /^(fikr|eslatma|note|idea|e|заметка|идея):\s*/iu,
    task: /^(vazifa|task|todo|v|задача):\s*/iu,
    link: /^(havola|link|h|ссылка):\s*/iu,
    journal: /^(kundalik|journal|k|дневник):\s*/iu,
};

export function parseQuickInput(raw, { today = todayISO(), defaultType = "task" } = {}) {
    let text = String(raw).trim();
    let type = null;

    for (const [key, pattern] of Object.entries(PREFIXES)) {
        if (pattern.test(text)) {
            type = key;
            text = text.replace(pattern, "");
            break;
        }
    }

    const tags = [];
    text = text.replace(/(^|\s)#([\p{L}\d_-]+)/gu, (_, space, tag) => {
        tags.push(tag.toLowerCase());
        return space;
    });

    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const url = urlMatch?.[0] ?? null;
    if (url && !type) type = "link";

    let priority = null;
    text = text.replace(/(^|\s)(!{1,2})(?=\s|$)/g, (_, space, marks) => {
        priority = marks.length === 2 ? "urgent" : "high";
        return space;
    });

    let dueDate = null;
    const lower = text.toLowerCase();
    if (TODAY.test(lower)) dueDate = today;
    else if (DAY_AFTER_TOMORROW.test(lower)) dueDate = addDays(today, 2);
    else if (TOMORROW.test(lower)) dueDate = addDays(today, 1);
    else {
        const weekday = WEEKDAYS.findIndex((pattern) => pattern.test(lower));
        if (weekday >= 0) {
            const current = new Date(`${today}T00:00:00`).getDay();
            dueDate = addDays(today, ((weekday - current + 7) % 7) || 7);
        }
    }
    if (dueDate && !type) type = "task";

    type ??= defaultType;
    const title = (type === "link" && url ? text.replace(url, "") : text).replace(/\s{2,}/g, " ").trim();

    const data = { title, tags };
    if (type === "task") Object.assign(data, dueDate && { dueDate }, priority && { priority });
    if (type === "link") Object.assign(data, { url: url ?? "" });
    if (type === "journal") Object.assign(data, { body: title, title: "" });
    if (type === "note" && title.length > 80) Object.assign(data, { title: `${title.slice(0, 60)}…`, body: title });
    return { type, data };
}
