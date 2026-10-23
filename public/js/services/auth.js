/**
 * Sessiya holati va barcha autentifikatsiya oqimlari.
 *
 * Holatlar:  loading → guest (kirmagan) | locked (sessiya bor, kalit yo'q) | unlocked (hammasi ochiq)
 * Master parol hech qachon serverga yuborilmaydi — faqat undan hosil qilingan authKey.
 */
import { api, apiEvents } from "../core/api.js";
import * as vaultCrypto from "../core/crypto.js";
import { Emitter } from "../core/events.js";
import { t } from "../core/i18n.js";
import { vault } from "../core/vault.js";
import { store } from "../core/store.js";
import { settings } from "./settings.js";

const events = new Emitter();
let status = "loading";
let account = null;

function setStatus(next) {
    status = next;
    events.emit("change", status);
}

/** Yangi master parol uchun kalitlar: { kdfSalt, kdfIterations, authKey, wrappedKey } */
async function newPasswordMaterial(password, dek) {
    const kdfSalt = vaultCrypto.newSalt();
    const kdfIterations = vaultCrypto.KDF_ITERATIONS;
    const { authKey, wrapKey } = await vaultCrypto.derivePasswordKeys(password, kdfSalt, kdfIterations);
    return { kdfSalt, kdfIterations, authKey, wrappedKey: await vaultCrypto.wrapDataKey(wrapKey, dek) };
}

async function newRecoveryMaterial(dek) {
    const recoveryKey = vaultCrypto.generateRecoveryKey();
    const { authKey, wrapKey } = await vaultCrypto.deriveRecoveryKeys(recoveryKey);
    return { recoveryKey, recoveryAuthKey: authKey, recoveryWrappedKey: await vaultCrypto.wrapDataKey(wrapKey, dek) };
}

/** Joriy master parolni tekshiradi: authKey (server uchun) va DEK baytlari (qayta o'rash uchun) */
async function proveCurrentPassword(password) {
    const { authKey, wrapKey } = await vaultCrypto.derivePasswordKeys(
        password,
        account.vault.kdfSalt,
        account.vault.kdfIterations
    );
    const dek = await vaultCrypto.unwrapDataKey(wrapKey, account.vault.wrappedKey).catch(() => {
        throw new vaultCrypto.DecryptionError(t("auth.wrongCurrentPassword"));
    });
    return { authKey, dek };
}

async function enterVault(nextAccount) {
    account = nextAccount;
    await settings.load(account.encryptedSettings);
    await store.load();
    setStatus("unlocked");
}

export const auth = {
    subscribe: (listener) => events.on("change", listener),
    get status() {
        return status;
    },
    get account() {
        return account;
    },

    /** Ilova ochilganda: sessiya bormi? */
    async init() {
        apiEvents.on("unauthorized", () => {
            if (status === "guest") return;
            this.forgetLocally();
        });
        try {
            account = await api.get("/auth/me");
            setStatus("locked");
        } catch (error) {
            if (error.status !== 401) throw error;
            setStatus("guest");
        }
    },

    /** @returns {Promise<string>} tiklash kaliti — foydalanuvchiga bir marta ko'rsatiladi */
    async register(email, password) {
        const dek = vaultCrypto.generateDataKeyBytes();
        const credentials = await newPasswordMaterial(password, dek);
        const { recoveryKey, ...recovery } = await newRecoveryMaterial(dek);

        await vault.setKey(dek.slice());
        try {
            const created = await api.post("/auth/register", {
                email,
                ...credentials,
                ...recovery,
                encryptedSettings: await settings.encryptDefaults(),
            });
            await enterVault(created);
        } catch (error) {
            vault.lock();
            throw error;
        } finally {
            dek.fill(0);
        }
        return recoveryKey;
    },

    async login(email, password) {
        const { kdfSalt, kdfIterations } = await api.post("/auth/prelogin", { email });
        const { authKey, wrapKey } = await vaultCrypto.derivePasswordKeys(password, kdfSalt, kdfIterations);
        const loggedIn = await api.post("/auth/login", { email, authKey });
        await vault.setKey(await vaultCrypto.unwrapDataKey(wrapKey, loggedIn.vault.wrappedKey));
        await enterVault(loggedIn);
    },

    /** Sessiya bor, lekin kalit xotirada yo'q (sahifa yangilangan yoki avtomatik qulflangan) */
    async unlock(password) {
        account = await api.get("/auth/me");
        await vault.unlock(password, account.vault);
        await enterVault(account);
    },

    lock() {
        vault.lock();
        store.clear();
        settings.reset();
        if (account) setStatus("locked");
    },

    async logout() {
        try {
            await api.post("/auth/logout");
        } finally {
            this.forgetLocally();
        }
    },

    /** Serverga murojaatsiz: kalit va ma'lumotlarni xotiradan o'chirib, kirish sahifasiga */
    forgetLocally() {
        vault.lock();
        store.clear();
        settings.reset();
        account = null;
        setStatus("guest");
    },

    /** Parolni unutganda: tiklash kaliti → DEK → yangi parol. Yangi tiklash kaliti qaytariladi. */
    async recover(email, recoveryKey, newPassword) {
        const recovery = await vaultCrypto.deriveRecoveryKeys(recoveryKey);
        const { recoveryWrappedKey } = await api.post("/auth/recovery/challenge", {
            email,
            recoveryAuthKey: recovery.authKey,
        });
        const dek = await vaultCrypto.unwrapDataKey(recovery.wrapKey, recoveryWrappedKey);
        const credentials = await newPasswordMaterial(newPassword, dek);
        const next = await newRecoveryMaterial(dek);

        const recovered = await api.post("/auth/recovery/reset", {
            email,
            recoveryAuthKey: recovery.authKey,
            ...credentials,
            newRecoveryAuthKey: next.recoveryAuthKey,
            newRecoveryWrappedKey: next.recoveryWrappedKey,
        });
        await vault.setKey(dek);
        await enterVault(recovered);
        return next.recoveryKey;
    },

    async changePassword(currentPassword, newPassword) {
        const { authKey: currentAuthKey, dek } = await proveCurrentPassword(currentPassword);
        const credentials = await newPasswordMaterial(newPassword, dek);
        dek.fill(0);
        await api.put("/account/password", { currentAuthKey, ...credentials });
        account = {
            ...account,
            vault: { kdfSalt: credentials.kdfSalt, kdfIterations: credentials.kdfIterations, wrappedKey: credentials.wrappedKey },
        };
    },

    /** Eski tiklash kaliti bekor bo'ladi, yangisi qaytariladi */
    async rotateRecoveryKey(currentPassword) {
        const { authKey: currentAuthKey, dek } = await proveCurrentPassword(currentPassword);
        const { recoveryKey, ...material } = await newRecoveryMaterial(dek);
        dek.fill(0);
        await api.put("/account/recovery", { currentAuthKey, ...material });
        return recoveryKey;
    },

    async deleteAccount(currentPassword) {
        const { authKey: currentAuthKey, dek } = await proveCurrentPassword(currentPassword);
        dek.fill(0);
        await api.delete("/account", { currentAuthKey });
        this.forgetLocally();
    },

    /** Shifrlangan zaxira nusxani import qilish uchun: o'sha paytdagi kalit ma'lumotlari bilan DEK'ni ochish */
    async openBackupKey(password, backupVault) {
        const { wrapKey } = await vaultCrypto.derivePasswordKeys(password, backupVault.kdfSalt, backupVault.kdfIterations);
        const dek = await vaultCrypto.unwrapDataKey(wrapKey, backupVault.wrappedKey).catch(() => {
            throw new vaultCrypto.DecryptionError(t("backup.wrongPassword"));
        });
        return vaultCrypto.importDataKey(dek);
    },
};
