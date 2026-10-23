/**
 * Foydalanuvchi sozlamalari — shifrlangan holda serverda (users.encrypted_settings).
 */
import { api } from "../core/api.js";
import { Emitter } from "../core/events.js";
import { vault } from "../core/vault.js";
import { applyTheme } from "../ui/theme.js";

export const DEFAULT_SETTINGS = Object.freeze({
    displayName: "",
    theme: "system",
    autoLockMinutes: 15,
    aiEnabled: false,
    aiInclude: { task: true, project: true, learning: true, journal: false, note: false, link: false },
    lastBackupAt: null,
});

let current = structuredClone(DEFAULT_SETTINGS);
const events = new Emitter();

export const settings = {
    get: () => current,
    subscribe: (listener) => events.on("change", listener),

    async load(encrypted) {
        let stored = {};
        if (encrypted) {
            try {
                stored = await vault.decryptSettings(encrypted);
            } catch {
                stored = {};
            }
        }
        current = { ...structuredClone(DEFAULT_SETTINGS), ...stored, aiInclude: { ...DEFAULT_SETTINGS.aiInclude, ...stored.aiInclude } };
        applyTheme(current.theme);
        events.emit("change", current);
    },

    async update(patch) {
        const next = { ...current, ...patch };
        await api.put("/account/settings", { encryptedSettings: await vault.encryptSettings(next) });
        current = next;
        if ("theme" in patch) applyTheme(current.theme);
        events.emit("change", current);
        return current;
    },

    /** Ro'yxatdan o'tishda serverga yuboriladigan boshlang'ich (shifrlangan) sozlamalar */
    encryptDefaults: () => vault.encryptSettings(structuredClone(DEFAULT_SETTINGS)),

    reset() {
        current = structuredClone(DEFAULT_SETTINGS);
    },
};
