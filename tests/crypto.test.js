import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as c from "../public/js/core/crypto.js";

const ITERATIONS = 100_000;

describe("crypto (brauzer moduli)", () => {
    test("bir xil parol va salt — bir xil authKey; boshqa parol — boshqa kalit", async () => {
        const salt = c.newSalt();
        const a = await c.derivePasswordKeys("Maxfiy-parol-123", salt, ITERATIONS);
        const b = await c.derivePasswordKeys("Maxfiy-parol-123", salt, ITERATIONS);
        const other = await c.derivePasswordKeys("Maxfiy-parol-124", salt, ITERATIONS);
        assert.equal(a.authKey, b.authKey);
        assert.notEqual(a.authKey, other.authKey);
        assert.equal(c.fromBase64(a.authKey).length, 32);
    });

    test("DEK to'g'ri kalit bilan ochiladi, noto'g'risi bilan — yo'q", async () => {
        const salt = c.newSalt();
        const right = await c.derivePasswordKeys("to'g'ri", salt, ITERATIONS);
        const wrong = await c.derivePasswordKeys("noto'g'ri", salt, ITERATIONS);
        const dek = c.generateDataKeyBytes();
        const wrapped = await c.wrapDataKey(right.wrapKey, dek);

        assert.deepEqual(await c.unwrapDataKey(right.wrapKey, wrapped), dek);
        await assert.rejects(c.unwrapDataKey(wrong.wrapKey, wrapped), c.DecryptionError);
    });

    test("JSON shifrlanadi va AAD (yozuv id) ga bog'lanadi", async () => {
        const key = await c.importDataKey(c.generateDataKeyBytes());
        const item = { id: "a", title: "Salom, dunyo! 🌍", tags: ["o'qish"] };
        const payload = await c.encryptJSON(key, item, "item-1");

        assert.match(payload, /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
        assert.ok(!payload.includes("Salom"));
        assert.deepEqual(await c.decryptJSON(key, payload, "item-1"), item);
        // Boshqa yozuvga ko'chirilgan shifr ochilmaydi
        await assert.rejects(c.decryptJSON(key, payload, "item-2"), c.DecryptionError);
    });

    test("har safar yangi IV — bir xil matn turlicha shifrlanadi", async () => {
        const key = await c.importDataKey(c.generateDataKeyBytes());
        const [first, second] = await Promise.all([c.encryptJSON(key, { x: 1 }), c.encryptJSON(key, { x: 1 })]);
        assert.notEqual(first, second);
    });

    test("buzilgan shifr aniqlanadi", async () => {
        const key = await c.importDataKey(c.generateDataKeyBytes());
        const payload = await c.encryptJSON(key, { secret: "parol" });
        const [v, iv, data] = payload.split(".");
        const tampered = c.fromBase64(data);
        tampered[0] ^= 1;
        await assert.rejects(c.decryptJSON(key, `${v}.${iv}.${c.toBase64(tampered)}`), c.DecryptionError);
    });

    test("tiklash kaliti: format, kodlash va kichik xatolarga chidamlilik", async () => {
        const key = c.generateRecoveryKey();
        assert.match(key, /^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);

        const bytes = c.decodeRecoveryKey(key);
        assert.equal(bytes.length, 32);
        assert.equal(c.encodeRecoveryKey(bytes), key);
        // kichik harf, bo'shliqlar, defissiz yozilsa ham bir xil
        assert.deepEqual(c.decodeRecoveryKey(` ${key.toLowerCase().replaceAll("-", " ")} `), bytes);

        const a = await c.deriveRecoveryKeys(key);
        const b = await c.deriveRecoveryKeys(key.replaceAll("-", ""));
        assert.equal(a.authKey, b.authKey);

        assert.throws(() => c.decodeRecoveryKey("ABCD-EFGH"), c.DecryptionError);
    });

    test("katta hajmdagi ma'lumot (1 MB) bilan ishlaydi", async () => {
        const key = await c.importDataKey(c.generateDataKeyBytes());
        const big = { body: "x".repeat(1_000_000) };
        assert.deepEqual(await c.decryptJSON(key, await c.encryptJSON(key, big)), big);
    });
});
