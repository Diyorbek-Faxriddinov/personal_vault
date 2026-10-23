/**
 * Store — ochilgan (deshifrlangan) yozuvlar xotirada, faqat vault ochiq paytda.
 *
 * Har bir o'zgarish: obyekt → vault.encryptItem → API. Serverdan kelgan har bir yozuv:
 * API → vault.decryptItem → obyekt. Komponentlar store.subscribe() orqali yangilanadi.
 *
 * Savat (trash) — yozuv ichidagi trashedAt belgisi (server buni ham bilmaydi).
 * Butunlay o'chirish — serverdan o'chirish (tombstone).
 */
import { api, ApiError } from "./api.js";
import { Emitter } from "./events.js";
import { t } from "./i18n.js";
import { vault } from "./vault.js";
import { buildItem } from "../models/types.js";

export class ConflictError extends Error {
    constructor(serverItem, serverVersion) {
        super(t("store.conflict"));
        this.name = "ConflictError";
        this.serverItem = serverItem;
        this.serverVersion = serverVersion;
    }
}

const entries = new Map(); // id → { item, version }
const events = new Emitter();
let cursor = null;
let loaded = false;
let corrupted = 0;

const notify = (reason) => events.emit("change", { reason });

async function decryptRecord(record) {
    try {
        return { item: await vault.decryptItem(record), version: record.version };
    } catch {
        corrupted++;
        return null;
    }
}

async function applyRecords(records) {
    const decrypted = await Promise.all(records.map((record) => (record.deletedAt ? null : decryptRecord(record))));
    records.forEach((record, index) => {
        if (record.deletedAt) entries.delete(record.id);
        else if (decrypted[index]) entries.set(record.id, decrypted[index]);
    });
}

async function save(item, version) {
    const ciphertext = await vault.encryptItem(item);
    try {
        const record = await api.put(`/items/${item.id}`, { ciphertext, version });
        entries.set(item.id, { item, version: record.version });
    } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.details?.current) {
            const current = await decryptRecord(error.details.current);
            if (current) entries.set(item.id, current);
            notify("conflict");
            throw new ConflictError(current?.item, error.details.current.version);
        }
        throw error;
    }
    notify("update");
    return item;
}

export const store = {
    subscribe: (listener) => events.on("change", listener),

    get isLoaded() {
        return loaded;
    },

    /** Shifrini ochib bo'lmagan yozuvlar soni (masalan, boshqa kalit bilan import qilinganlar) */
    get corruptedCount() {
        return corrupted;
    },

    async load() {
        entries.clear();
        corrupted = 0;
        const { items, cursor: next } = await api.get("/items");
        await applyRecords(items);
        cursor = next;
        loaded = true;
        notify("load");
    },

    /** Boshqa qurilmalardagi o'zgarishlarni olib keladi */
    async sync() {
        if (!loaded || !vault.isUnlocked) return 0;
        const { items, cursor: next } = await api.get(`/items?since=${encodeURIComponent(cursor)}`);
        const changed = items.filter((record) => {
            const local = entries.get(record.id);
            return record.deletedAt ? Boolean(local) : !local || local.version !== record.version;
        });
        cursor = next;
        if (changed.length) {
            await applyRecords(changed);
            notify("sync");
        }
        return changed.length;
    },

    clear() {
        entries.clear();
        cursor = null;
        loaded = false;
        notify("clear");
    },

    get: (id) => entries.get(id)?.item ?? null,

    /** Savatdagilarsiz barcha yozuvlar (yoki ixtiyoriy filtr bilan) */
    all({ includeTrashed = false } = {}) {
        const items = [...entries.values()].map((entry) => entry.item);
        return includeTrashed ? items : items.filter((item) => !item.trashedAt);
    },

    byType(type) {
        return this.all().filter((item) => item.type === type);
    },

    trashed() {
        return this.all({ includeTrashed: true }).filter((item) => item.trashedAt);
    },

    /** Barcha teglar va ularning soni */
    tags() {
        const counts = new Map();
        for (const item of this.all()) {
            for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    },

    async create(type, data = {}) {
        const item = buildItem(type, data);
        const record = await api.post("/items", { id: item.id, ciphertext: await vault.encryptItem(item) });
        entries.set(item.id, { item, version: record.version });
        notify("create");
        return item;
    },

    /** Qisman yangilash. Boshqa qurilmada o'zgargan bo'lsa ConflictError */
    async update(id, patch) {
        const entry = entries.get(id);
        if (!entry) throw new Error(t("store.notFound"));
        const item = { ...entry.item, ...patch, id, type: entry.item.type, updatedAt: new Date().toISOString() };
        return save(item, entry.version);
    },

    /** To'qnashuvda foydalanuvchi "mening versiyam" ni tanlasa — server versiyasi ustidan yozish */
    async overwrite(item, serverVersion) {
        return save({ ...item, updatedAt: new Date().toISOString() }, serverVersion);
    },

    trash: (id) => store.update(id, { trashedAt: new Date().toISOString(), pinned: false }),

    restore: (id) => store.update(id, { trashedAt: null }),

    async purge(id) {
        await api.delete(`/items/${id}`);
        entries.delete(id);
        notify("delete");
    },

    async emptyTrash() {
        const ids = this.trashed().map((item) => item.id);
        for (const id of ids) {
            await api.delete(`/items/${id}`);
            entries.delete(id);
        }
        notify("delete");
        return ids.length;
    },

    /** Import: yozuvlarni qismlarga bo'lib yuboradi. Mavjud tirik yozuvlar o'zgarmaydi. */
    async importItems(items, onProgress) {
        const summary = { created: 0, restored: 0, skipped: 0 };
        const CHUNK = 200;
        for (let i = 0; i < items.length; i += CHUNK) {
            const chunk = items.slice(i, i + CHUNK);
            const payload = await Promise.all(
                chunk.map(async (item) => ({ id: item.id, ciphertext: await vault.encryptItem(item) }))
            );
            const result = await api.post("/items/batch", { items: payload });
            for (const key of Object.keys(summary)) summary[key] += result[key];
            onProgress?.(Math.min(i + CHUNK, items.length), items.length);
        }
        await this.load();
        return summary;
    },
};
