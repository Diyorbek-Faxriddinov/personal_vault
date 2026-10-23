/**
 * Testlar uchun HTTP mijoz: cookie'ni eslab qoladi va brauzer qiladigan kriptografik amallarni
 * xuddi public/js/core/crypto.js orqali bajaradi (ya'ni brauzer kodining o'zi sinovdan o'tadi).
 */
import { once } from "node:events";
import * as vaultCrypto from "../../public/js/core/crypto.js";

export const TEST_ITERATIONS = 100_000;

export async function startServer() {
    const { createApp } = await import("../../server/app.js");
    const server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

export class TestClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cookie = null;
    }

    async request(method, path, body, { csrf = true, headers = {} } = {}) {
        const response = await fetch(this.baseUrl + path, {
            method,
            headers: {
                ...(body === undefined ? {} : { "content-type": "application/json" }),
                ...(csrf ? { "x-vault-request": "1" } : {}),
                ...(this.cookie ? { cookie: this.cookie } : {}),
                ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const header of response.headers.getSetCookie()) {
            const [pair] = header.split(";");
            this.cookie = pair.endsWith("=") ? null : pair;
        }
        const text = await response.text();
        let parsed = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text;
        }
        return { status: response.status, body: parsed, headers: response.headers };
    }

    get = (path, options) => this.request("GET", path, undefined, options);
    post = (path, body, options) => this.request("POST", path, body ?? {}, options);
    put = (path, body, options) => this.request("PUT", path, body ?? {}, options);
    delete = (path, body, options) => this.request("DELETE", path, body, options);

    // ─── Brauzerdagi auth oqimining nusxasi ─────────────────────

    async register(email, password) {
        const kdfSalt = vaultCrypto.newSalt();
        const { authKey, wrapKey } = await vaultCrypto.derivePasswordKeys(password, kdfSalt, TEST_ITERATIONS);
        const dek = vaultCrypto.generateDataKeyBytes();
        const recoveryKey = vaultCrypto.generateRecoveryKey();
        const recovery = await vaultCrypto.deriveRecoveryKeys(recoveryKey);

        const response = await this.post("/api/auth/register", {
            email,
            kdfSalt,
            kdfIterations: TEST_ITERATIONS,
            authKey,
            wrappedKey: await vaultCrypto.wrapDataKey(wrapKey, dek),
            recoveryAuthKey: recovery.authKey,
            recoveryWrappedKey: await vaultCrypto.wrapDataKey(recovery.wrapKey, dek),
        });
        this.dataKey = await vaultCrypto.importDataKey(dek);
        return { response, recoveryKey, dek };
    }

    async login(email, password) {
        const pre = await this.post("/api/auth/prelogin", { email });
        const { authKey, wrapKey } = await vaultCrypto.derivePasswordKeys(password, pre.body.kdfSalt, pre.body.kdfIterations);
        const response = await this.post("/api/auth/login", { email, authKey });
        if (response.status === 200) {
            const dek = await vaultCrypto.unwrapDataKey(wrapKey, response.body.vault.wrappedKey);
            this.dataKey = await vaultCrypto.importDataKey(dek);
        }
        return { response, authKey };
    }

    async currentAuthKey(password) {
        const me = await this.get("/api/auth/me");
        const keys = await vaultCrypto.derivePasswordKeys(password, me.body.vault.kdfSalt, me.body.vault.kdfIterations);
        return { ...keys, account: me.body };
    }

    encryptItem = (item) => vaultCrypto.encryptJSON(this.dataKey, item, item.id);
    decryptItem = (record) => vaultCrypto.decryptJSON(this.dataKey, record.ciphertext, record.id);
}

export { vaultCrypto };
