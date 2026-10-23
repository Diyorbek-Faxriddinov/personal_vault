/**
 * Vault — ochilgan ma'lumot kaliti (DEK) faqat shu modul ichida, faqat xotirada saqlanadi.
 * Sahifa yangilansa yoki "Qulflash" bosilsa kalit yo'qoladi va master parol qayta so'raladi.
 * Kalit "eksport qilib bo'lmaydigan" CryptoKey — uni hatto JavaScript orqali ham o'qib bo'lmaydi.
 */
import * as vaultCrypto from "./crypto.js";
import { Emitter } from "./events.js";
import { t } from "./i18n.js";

const SETTINGS_AAD = "vault:settings";

let dataKey = null;

function requireKey() {
    if (!dataKey) throw new Error(t("vault.locked"));
    return dataKey;
}

export const vaultEvents = new Emitter();

export const vault = {
    get isUnlocked() {
        return dataKey !== null;
    },

    /** Xom DEK baytlaridan kalitni o'rnatadi va baytlarni xotiradan tozalaydi */
    async setKey(dekBytes) {
        dataKey = await vaultCrypto.importDataKey(dekBytes);
        dekBytes.fill(0);
        vaultEvents.emit("unlock");
    },

    /** Master parol bilan ochish. Noto'g'ri parolda DecryptionError */
    async unlock(password, vaultInfo) {
        const { wrapKey } = await vaultCrypto.derivePasswordKeys(password, vaultInfo.kdfSalt, vaultInfo.kdfIterations);
        const dek = await vaultCrypto.unwrapDataKey(wrapKey, vaultInfo.wrappedKey).catch(() => {
            throw new vaultCrypto.DecryptionError(t("auth.wrongPassword"));
        });
        await this.setKey(dek);
    },

    lock() {
        if (!dataKey) return;
        dataKey = null;
        vaultEvents.emit("lock");
    },

    encryptItem: (item) => vaultCrypto.encryptJSON(requireKey(), item, item.id),

    decryptItem: (record) => vaultCrypto.decryptJSON(requireKey(), record.ciphertext, record.id),

    encryptSettings: (settings) => vaultCrypto.encryptJSON(requireKey(), settings, SETTINGS_AAD),

    decryptSettings: (payload) => vaultCrypto.decryptJSON(requireKey(), payload, SETTINGS_AAD),
};
