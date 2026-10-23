/**
 * Yozuv turlari reestri — ilovaning "sxemasi".
 *
 * Har bir tur: nomi, ikonkasi, maydonlari (tahrirlash formasi shulardan avtomatik quriladi),
 * standart qiymatlari, ro'yxatdagi qisqa ko'rinishi va filtrlari.
 * Yangi tur qo'shish uchun shu faylga bitta obyekt qo'shish kifoya.
 *
 * Barcha turlar uchun umumiy maydonlar:
 *   { id, type, title, body, tags[], pinned, favorite, trashedAt, createdAt, updatedAt }
 *
 * Nomlar va yorliqlar — tarjima kalitlari (locales/*.js); til almashganda darhol yangilanadi.
 */
import { t } from "../core/i18n.js";

/**
 * Tarjima qilinadigan yorliqlar to'plami: qiymat har safar joriy tilda o'qiladi (getter),
 * shuning uchun til almashganda qayta render kifoya. Object.entries() bilan ham ishlaydi.
 */
const labels = (prefix, keys) =>
    Object.freeze(Object.defineProperties({}, Object.fromEntries(keys.map((key) => [key, { enumerable: true, get: () => t(`${prefix}.${key}`) }]))));

export const TASK_STATUS = labels("taskStatus", ["todo", "doing", "done"]);
export const PRIORITY = labels("priority", ["low", "medium", "high", "urgent"]);
export const RECURRENCE = labels("recurrence", ["none", "daily", "weekly", "monthly"]);
export const PROJECT_STATUS = labels("projectStatus", ["idea", "active", "paused", "done"]);
export const LEARNING_KIND = labels("learningKind", ["course", "book", "video", "article", "topic", "skill"]);
export const LEARNING_STATUS = labels("learningStatus", ["planned", "in_progress", "paused", "completed"]);
export const MOODS = [
    { value: 1, emoji: "😞" },
    { value: 2, emoji: "😕" },
    { value: 3, emoji: "😐" },
    { value: 4, emoji: "🙂" },
    { value: 5, emoji: "😄" },
].map((mood) => Object.defineProperty(mood, "label", { enumerable: true, get: () => t(`mood.${mood.value}`) }));

const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

// Umumiy maydon ta'riflari (yorliqlar chaqirilgan paytdagi tilda)
const f = {
    title: (label = t("field.title"), extra = {}) => ({ key: "title", label, type: "text", required: true, maxLength: 300, ...extra }),
    body: (label = t("field.body"), placeholder = t("field.body.placeholder")) => ({
        key: "body",
        label,
        type: "markdown",
        placeholder,
    }),
    tags: () => ({ key: "tags", label: t("field.tags"), type: "tags" }),
    url: (label = t("field.url"), extra = {}) => ({ key: "url", label, type: "url", placeholder: "https://", ...extra }),
};

/** Turning nomi, ko'plikdagi nomi va tavsifi — "types.<key>.*" kalitlaridan, har safar joriy tilda */
const localized = (key) =>
    Object.getOwnPropertyDescriptors({
        get label() {
            return t(`types.${key}.label`);
        },
        get plural() {
            return t(`types.${key}.plural`);
        },
        get description() {
            return t(`types.${key}.description`);
        },
    });

const statusFilter = (map) => [{ key: "status", label: t("field.status"), options: options(map) }];

/** Getter'lar (label, fields, filters...) bilan obyekt: til almashganda qiymatlar o'zi yangilanadi */
const defineType = (key, props) => Object.defineProperties({ key }, { ...localized(key), ...Object.getOwnPropertyDescriptors(props) });

export const TYPES = {
    task: defineType("task", {
        route: "tasks",
        icon: "fa-list-check",
        get fields() {
            return [
                f.title(t("types.task.label"), { placeholder: t("field.task.title.placeholder") }),
                { key: "status", label: t("field.status"), type: "select", options: options(TASK_STATUS), half: true },
                { key: "priority", label: t("field.priority"), type: "select", options: options(PRIORITY), half: true },
                { key: "dueDate", label: t("field.dueDate"), type: "date", half: true },
                { key: "recurrence", label: t("field.recurrence"), type: "select", options: options(RECURRENCE), half: true },
                { key: "projectId", label: t("types.project.label"), type: "project" },
                { key: "subtasks", label: t("field.subtasks"), type: "checklist", placeholder: t("field.subtasks.placeholder") },
                f.body(t("field.task.body")),
                f.tags(),
            ];
        },
        defaults: { status: "todo", priority: "medium", dueDate: null, recurrence: "none", projectId: null, subtasks: [], completedAt: null },
        get filters() {
            return statusFilter(TASK_STATUS);
        },
    }),

    project: defineType("project", {
        route: "projects",
        icon: "fa-diagram-project",
        get fields() {
            return [
                f.title(t("field.project.title")),
                { key: "status", label: t("field.status"), type: "select", options: options(PROJECT_STATUS), half: true },
                { key: "deadline", label: t("field.deadline"), type: "date", half: true },
                { key: "goal", label: t("field.goal"), type: "textarea", placeholder: t("field.goal.placeholder") },
                f.url(t("field.project.url")),
                f.body(t("field.project.body")),
                f.tags(),
            ];
        },
        defaults: { status: "active", deadline: null, goal: "", url: "" },
        get filters() {
            return statusFilter(PROJECT_STATUS);
        },
    }),

    learning: defineType("learning", {
        route: "learning",
        icon: "fa-graduation-cap",
        get fields() {
            return [
                f.title(t("field.name"), { placeholder: t("field.learning.title.placeholder") }),
                { key: "kind", label: t("field.kind"), type: "select", options: options(LEARNING_KIND), half: true },
                { key: "status", label: t("field.status"), type: "select", options: options(LEARNING_STATUS), half: true },
                { key: "targetDate", label: t("field.targetDate"), type: "date", half: true },
                { key: "hoursSpent", label: t("field.hoursSpent"), type: "number", min: 0, step: 0.5, half: true },
                f.url(t("field.learning.url")),
                { key: "milestones", label: t("field.milestones"), type: "checklist", placeholder: t("field.milestones.placeholder") },
                f.body(t("field.learning.body")),
                f.tags(),
            ];
        },
        defaults: { kind: "course", status: "planned", targetDate: null, hoursSpent: 0, url: "", milestones: [] },
        get filters() {
            return statusFilter(LEARNING_STATUS);
        },
    }),

    link: defineType("link", {
        route: "links",
        icon: "fa-link",
        get fields() {
            return [
                f.url("URL", { required: true }),
                f.title(t("field.title"), { required: false, placeholder: t("field.link.title.placeholder") }),
                { key: "description", label: t("field.description"), type: "textarea", placeholder: t("field.description.placeholder") },
                { key: "collection", label: t("field.collection"), type: "text", placeholder: t("field.collection.placeholder"), half: true },
                { key: "read", label: t("field.read"), type: "checkbox", half: true },
                f.body(t("field.notes")),
                f.tags(),
            ];
        },
        defaults: { url: "", description: "", collection: "", read: false },
        get filters() {
            return [
                {
                    key: "read",
                    label: t("field.status"),
                    options: [
                        { value: false, label: t("link.unread") },
                        { value: true, label: t("link.read") },
                    ],
                },
            ];
        },
    }),

    note: defineType("note", {
        route: "notes",
        icon: "fa-note-sticky",
        get fields() {
            return [f.title(), f.body(), f.tags()];
        },
        defaults: {},
        filters: [],
    }),

    journal: defineType("journal", {
        route: "journal",
        icon: "fa-book-open",
        get fields() {
            return [
                { key: "date", label: t("field.date"), type: "date", required: true, half: true },
                { key: "mood", label: t("field.mood"), type: "mood", half: true },
                f.title(t("field.title"), { required: false, placeholder: t("field.journal.title.placeholder") }),
                f.body(t("field.journal.body"), t("field.journal.body.placeholder")),
                { key: "gratitude", label: t("field.gratitude"), type: "textarea", placeholder: t("field.gratitude.placeholder") },
                f.tags(),
            ];
        },
        defaults: { date: null, mood: null, gratitude: "" },
        dynamicDefaults: () => ({ date: todayISO() }),
        filters: [],
    }),

    secret: defineType("secret", {
        route: "secrets",
        icon: "fa-key",
        sensitive: true,
        get fields() {
            return [
                f.title(t("field.name"), { placeholder: t("field.secret.title.placeholder") }),
                { key: "username", label: t("field.username"), type: "text", copyable: true, autocomplete: "off" },
                { key: "password", label: t("field.password"), type: "password", copyable: true },
                f.url(t("field.secret.url")),
                f.body(t("field.secret.body"), t("field.secret.body.placeholder")),
                f.tags(),
            ];
        },
        defaults: { username: "", password: "", url: "" },
        filters: [],
    }),
};

/** Menyudagi tartib */
export const TYPE_ORDER = ["task", "project", "learning", "link", "note", "journal", "secret"];

export const getType = (key) => TYPES[key] ?? null;
export const typeByRoute = (route) => Object.values(TYPES).find((type) => type.route === route) ?? null;

/** Yangi yozuv uchun to'liq obyekt (umumiy + tur maydonlari) */
export function buildItem(typeKey, data = {}) {
    const type = TYPES[typeKey];
    const now = new Date().toISOString();
    return {
        id: newId(),
        type: typeKey,
        title: "",
        body: "",
        tags: [],
        pinned: false,
        favorite: false,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
        ...structuredClone(type.defaults),
        ...(type.dynamicDefaults?.() ?? {}),
        ...data,
    };
}

/** Sarlavha bo'lmasa ham ro'yxatda ko'rinadigan nom */
export function displayTitle(item) {
    if (item.title?.trim()) return item.title.trim();
    if (item.type === "link" && item.url) return hostname(item.url);
    if (item.type === "journal" && item.date) return t("types.journal.untitled", { date: item.date });
    return t("common.untitled");
}

/** Faqat http(s) havolalar — import qilingan "javascript:" kabi xavfli manzillar bloklanadi */
export const safeUrl = (url) => (/^https?:\/\//i.test(String(url ?? "").trim()) ? String(url).trim() : null);

export function hostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export function newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
