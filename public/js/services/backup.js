/**
 * Zaxira nusxa: eksport va import.
 *
 *  • Shifrlangan nusxa (tavsiya etiladi) — eksport paytidagi master parol bilangina ochiladi.
 *  • Ochiq JSON — boshqa dasturlarga ko'chirish uchun (DIQQAT: hamma narsa ochiq matnda).
 *  • Markdown — o'qish uchun qulay ko'rinish (maxfiy yozuvlar kiritilmaydi).
 */
import * as vaultCrypto from "../core/crypto.js";
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { vault } from "../core/vault.js";
import { buildItem, displayTitle, getType, newId, TYPE_ORDER, TYPES } from "../models/types.js";
import { auth } from "./auth.js";
import { settings } from "./settings.js";

const ENCRYPTED_FORMAT = "shaxsiy-vault/encrypted";
const PLAIN_FORMAT = "shaxsiy-vault/plain";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stamp = () => new Date().toISOString().slice(0, 10);

async function markBackedUp() {
    await settings.update({ lastBackupAt: new Date().toISOString() });
}

export async function exportEncrypted() {
    const items = store.all({ includeTrashed: true });
    const payload = {
        format: ENCRYPTED_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        count: items.length,
        vault: auth.account.vault,
        items: await Promise.all(items.map(async (item) => ({ id: item.id, ciphertext: await vault.encryptItem(item) }))),
    };
    await markBackedUp();
    return { filename: `${t("backup.file.encrypted")}-${stamp()}.json`, content: JSON.stringify(payload), mime: "application/json" };
}

export async function exportPlainJSON() {
    const payload = {
        format: PLAIN_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        items: store.all({ includeTrashed: true }),
    };
    return { filename: `${t("backup.file.plain")}-${stamp()}.json`, content: JSON.stringify(payload, null, 2), mime: "application/json" };
}

export function exportMarkdown() {
    const lines = [`# ${t("app.name")} — ${stamp()}`, ""];
    for (const key of TYPE_ORDER.filter((k) => !TYPES[k].sensitive)) {
        const items = store.byType(key);
        if (!items.length) continue;
        lines.push(`## ${TYPES[key].plural}`, "");
        for (const item of items) {
            lines.push(`### ${displayTitle(item)}`);
            const meta = [item.date, item.dueDate && `${t("field.dueDate")}: ${item.dueDate}`, item.url, item.tags?.length && item.tags.map((t) => `#${t}`).join(" ")];
            const metaLine = meta.filter(Boolean).join(" · ");
            if (metaLine) lines.push(`_${metaLine}_`);
            for (const entry of [...(item.subtasks ?? []), ...(item.milestones ?? [])]) {
                lines.push(`- [${entry.done ? "x" : " "}] ${entry.text}`);
            }
            for (const text of [item.goal, item.description, item.body, item.gratitude]) if (text) lines.push("", text);
            lines.push("");
        }
    }
    return { filename: `vault-${stamp()}.md`, content: lines.join("\n"), mime: "text/markdown" };
}

/** Fayl matnini o'qib, formatini aniqlaydi */
export function parseBackup(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(t("backup.notJson"));
    }
    if (data?.format === ENCRYPTED_FORMAT && Array.isArray(data.items) && data.vault) return { kind: "encrypted", data };
    if (data?.format === PLAIN_FORMAT && Array.isArray(data.items)) return { kind: "plain", data };
    throw new Error(t("backup.notBackup"));
}

/** Begona fayldan kelgan yozuvni xavfsiz ko'rinishga keltiradi */
function sanitize(raw) {
    if (!raw || typeof raw !== "object" || !getType(raw.type)) return null;
    const base = buildItem(raw.type);
    const item = { ...base };
    for (const key of Object.keys(base)) {
        if (key in raw && (raw[key] === null || typeof raw[key] === typeof base[key] || base[key] === null)) item[key] = raw[key];
    }
    item.id = UUID.test(raw.id) ? raw.id : newId();
    item.type = raw.type;
    item.tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string").slice(0, 50) : [];
    return item;
}

export async function importBackup(parsed, { password, onProgress } = {}) {
    let rawItems;
    let failed = 0;

    if (parsed.kind === "encrypted") {
        const key = await auth.openBackupKey(password, parsed.data.vault);
        rawItems = await Promise.all(
            parsed.data.items.map((record) =>
                vaultCrypto.decryptJSON(key, record.ciphertext, record.id).catch(() => {
                    failed++;
                    return null;
                })
            )
        );
    } else {
        rawItems = parsed.data.items;
    }

    const items = rawItems.map(sanitize).filter(Boolean);
    failed += rawItems.length - failed - items.length;
    const summary = await store.importItems(items, onProgress);
    return { ...summary, failed };
}
