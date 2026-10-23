import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, test } from "node:test";
import { resetDatabase } from "./helpers/setup.js";
import { startServer, TestClient, TEST_ITERATIONS, vaultCrypto } from "./helpers/client.js";

const { pool } = await import("../server/db/pool.js");

let server;
const client = () => new TestClient(server.baseUrl);

before(async () => {
    await resetDatabase();
    server = await startServer();
});

after(async () => {
    await server?.close();
    await pool.end();
});

describe("xavfsizlik sarlavhalari va CSRF", () => {
    test("CSP qat'iy, API javoblari keshlanmaydi", async () => {
        const res = await client().get("/api/health");
        assert.equal(res.status, 200);
        assert.equal(res.body.database, true);
        assert.equal(res.headers.get("cache-control"), "no-store");
        assert.match(res.headers.get("content-security-policy"), /script-src 'self'/);
        assert.equal(res.headers.get("x-powered-by"), null);
    });

    test("maxsus sarlavhasiz o'zgartiruvchi so'rov rad etiladi", async () => {
        const res = await client().post("/api/auth/prelogin", { email: "a@b.uz" }, { csrf: false });
        assert.equal(res.status, 403);
    });

    test("begona Origin rad etiladi", async () => {
        const res = await client().post("/api/auth/prelogin", { email: "a@b.uz" }, { headers: { origin: "https://evil.example" } });
        assert.equal(res.status, 403);
    });

    test("SPA yo'llari index.html qaytaradi, noma'lum API — 404 JSON", async () => {
        const page = await fetch(`${server.baseUrl}/tasks/some-id`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /<div id="app"/);

        const api = await client().get("/api/nope");
        assert.equal(api.status, 404);
        assert.equal(api.body.error.code, "NOT_FOUND");
    });
});

describe("server xabarlari tarjimasi (en/uz/ru)", () => {
    const wrongLogin = (headers) =>
        client().post("/api/auth/login", { email: "yoq@example.uz", authKey: Buffer.alloc(32).toString("base64") }, { headers });

    test("X-Vault-Lang sarlavhasi bo'yicha til; standart — ingliz tili", async () => {
        assert.equal((await wrongLogin({})).body.error.message, "Wrong email or master password");
        assert.equal((await wrongLogin({ "x-vault-lang": "uz" })).body.error.message, "Email yoki master parol noto'g'ri");
        assert.equal((await wrongLogin({ "x-vault-lang": "ru" })).body.error.message, "Неверный email или мастер-пароль");
    });

    test("sarlavha bo'lmasa — Accept-Language; noma'lum til — ingliz tili", async () => {
        assert.equal((await wrongLogin({ "accept-language": "ru-RU,ru;q=0.9,en;q=0.8" })).body.error.message, "Неверный email или мастер-пароль");
        assert.equal((await wrongLogin({ "accept-language": "de-DE,uz;q=0.5" })).body.error.message, "Email yoki master parol noto'g'ri");
        assert.equal((await wrongLogin({ "x-vault-lang": "de" })).body.error.message, "Wrong email or master password");
    });

    test("validatsiya xatolarining maydon xabarlari ham tarjima qilinadi", async () => {
        const res = await client().post("/api/auth/prelogin", { email: "notogri" }, { headers: { "x-vault-lang": "uz" } });
        assert.equal(res.status, 400);
        assert.equal(res.body.error.message, "So'rov ma'lumotlari noto'g'ri");
        assert.deepEqual(res.body.error.details, [{ field: "email", message: "Email manzil noto'g'ri" }]);
    });

    test("parametrli xabarlar: noma'lum API manzili", async () => {
        const res = await client().get("/api/nope", { headers: { "x-vault-lang": "ru" } });
        assert.equal(res.body.error.message, "API-адрес не найден: GET /api/nope");
    });
});

describe("autentifikatsiya", () => {
    const email = "Aziza@Example.UZ";
    const password = "Juda-Kuchli-Parol-2026";

    test("ro'yxatdan o'tish: sessiya cookie, hisob ma'lumotlari; parol serverga bormaydi", async () => {
        const c = client();
        const { response } = await c.register(email, password);
        assert.equal(response.status, 201);
        assert.equal(response.body.user.email, "aziza@example.uz");
        assert.equal(response.body.vault.kdfIterations, TEST_ITERATIONS);
        assert.ok(c.cookie?.startsWith("vault_sid="));
        assert.equal(response.body.auth_hash, undefined);

        const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", ["aziza@example.uz"]);
        const stored = JSON.stringify(rows[0]);
        assert.ok(!stored.includes(password), "parol bazada bo'lmasligi kerak");
        assert.match(rows[0].auth_hash, /^scrypt\$/);
    });

    test("bir xil email bilan qayta ro'yxat — 409", async () => {
        const { response } = await client().register("aziza@example.uz", "Boshqa-Parol-12345");
        assert.equal(response.status, 409);
    });

    test("prelogin noma'lum email uchun ham barqaror javob beradi (emailni oshkor qilmaydi)", async () => {
        const a = await client().post("/api/auth/prelogin", { email: "yoq@example.uz" });
        const b = await client().post("/api/auth/prelogin", { email: "yoq@example.uz" });
        assert.equal(a.status, 200);
        assert.equal(a.body.kdfSalt, b.body.kdfSalt);
        assert.equal(a.body.kdfSalt.length, 24);
    });

    test("noto'g'ri parol — 401 va jurnalga yoziladi; to'g'ri parol — DEK ochiladi", async () => {
        const wrong = await client().login(email, "Notogri-parol-999");
        assert.equal(wrong.response.status, 401);

        const c = client();
        const ok = await c.login(email, password);
        assert.equal(ok.response.status, 200);
        assert.ok(c.dataKey);

        const activity = await c.get("/api/account/activity");
        const events = activity.body.events.map((e) => e.event);
        assert.ok(events.includes("login_failed"));
        assert.ok(events.includes("login"));
    });

    test("noto'g'ri formatdagi so'rov — 400 va maydonlar ro'yxati", async () => {
        const res = await client().post("/api/auth/login", { email: "emas", authKey: "qisqa" });
        assert.equal(res.status, 400);
        assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ["authKey", "email"]);
    });

    test("/me sessiyasiz — 401; logout'dan keyin sessiya yaroqsiz", async () => {
        assert.equal((await client().get("/api/auth/me")).status, 401);

        const c = client();
        await c.login(email, password);
        const token = c.cookie;
        assert.equal((await c.get("/api/auth/me")).status, 200);
        assert.equal((await c.post("/api/auth/logout")).status, 204);
        assert.equal(c.cookie, null);

        const reuse = await client().get("/api/auth/me", { headers: { cookie: token } });
        assert.equal(reuse.status, 401);
    });
});

describe("yozuvlar (shifrlangan)", () => {
    let alice;
    let bob;

    before(async () => {
        alice = client();
        bob = client();
        await alice.register("alice@example.uz", "Alice-Parol-12345");
        await bob.register("bob@example.uz", "Bob-Parol-12345");
    });

    test("yaratish, o'qish va ochish — serverda faqat shifr", async () => {
        const item = { id: crypto.randomUUID(), type: "task", title: "Matematika uy vazifasi", tags: ["maktab"] };
        const created = await alice.post("/api/items", { id: item.id, ciphertext: await alice.encryptItem(item) });
        assert.equal(created.status, 201);
        assert.equal(created.body.version, 1);

        const [rows] = await pool.query("SELECT ciphertext FROM items WHERE id = ?", [item.id]);
        assert.ok(!rows[0].ciphertext.includes("Matematika"));

        const list = await alice.get("/api/items");
        const record = list.body.items.find((r) => r.id === item.id);
        assert.deepEqual(await alice.decryptItem(record), item);
    });

    test("boshqa foydalanuvchi yozuvni ko'ra olmaydi va o'zgartira olmaydi", async () => {
        const id = crypto.randomUUID();
        await alice.post("/api/items", { id, ciphertext: await alice.encryptItem({ id, title: "Maxfiy" }) });

        const bobList = await bob.get("/api/items");
        assert.ok(!bobList.body.items.some((r) => r.id === id));

        const attempt = await bob.put(`/api/items/${id}`, { ciphertext: await bob.encryptItem({ id }), version: 1 });
        assert.equal(attempt.status, 404);
        assert.equal((await bob.delete(`/api/items/${id}`)).status, 404);
    });

    test("optimistik qulf: eskirgan versiya bilan yangilash — 409 va joriy versiya", async () => {
        const id = crypto.randomUUID();
        await alice.post("/api/items", { id, ciphertext: await alice.encryptItem({ id, title: "v1" }) });

        const v2 = await alice.put(`/api/items/${id}`, { ciphertext: await alice.encryptItem({ id, title: "v2" }), version: 1 });
        assert.equal(v2.status, 200);
        assert.equal(v2.body.version, 2);

        const stale = await alice.put(`/api/items/${id}`, { ciphertext: await alice.encryptItem({ id, title: "eski" }), version: 1 });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error.details.current.version, 2);
        assert.equal((await alice.decryptItem(stale.body.error.details.current)).title, "v2");
    });

    test("qisman sinxronizatsiya: o'zgarganlar va o'chirilganlar (tombstone)", async () => {
        const full = await alice.get("/api/items");
        const cursor = full.body.cursor;

        const id = crypto.randomUUID();
        await alice.post("/api/items", { id, ciphertext: await alice.encryptItem({ id, title: "yangi" }) });
        const victim = full.body.items[0].id;
        assert.equal((await alice.delete(`/api/items/${victim}`)).status, 204);

        const delta = await alice.get(`/api/items?since=${encodeURIComponent(cursor)}`);
        const ids = delta.body.items.map((r) => r.id);
        assert.ok(ids.includes(id));
        const tombstone = delta.body.items.find((r) => r.id === victim);
        assert.ok(tombstone.deletedAt);
        assert.equal(tombstone.ciphertext, "");

        const again = await alice.get("/api/items");
        assert.ok(!again.body.items.some((r) => r.id === victim));
    });

    test("batch import: yangilar qo'shiladi, mavjudlar o'tkaziladi, o'chirilganlar tiklanadi", async () => {
        const fresh = crypto.randomUUID();
        const existing = (await alice.get("/api/items")).body.items[0].id;
        const deleted = crypto.randomUUID();
        await alice.post("/api/items", { id: deleted, ciphertext: await alice.encryptItem({ id: deleted }) });
        await alice.delete(`/api/items/${deleted}`);

        const res = await alice.post("/api/items/batch", {
            items: await Promise.all(
                [fresh, existing, deleted].map(async (id) => ({ id, ciphertext: await alice.encryptItem({ id, title: "import" }) }))
            ),
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { created: 1, restored: 1, skipped: 1 });
    });

    test("noto'g'ri formatdagi shifr qabul qilinmaydi", async () => {
        const res = await alice.post("/api/items", { id: crypto.randomUUID(), ciphertext: "<script>alert(1)</script>" });
        assert.equal(res.status, 400);
    });
});

describe("hisob boshqaruvi", () => {
    const email = "sardor@example.uz";
    const password = "Sardor-Parol-2026";

    test("parolni almashtirish: eski parol ishlamaydi, yozuvlar yangi parol bilan ochiladi, boshqa sessiyalar yopiladi", async () => {
        const main = client();
        await main.register(email, password);
        const other = client();
        await other.login(email, password);

        const id = crypto.randomUUID();
        await main.post("/api/items", { id, ciphertext: await main.encryptItem({ id, title: "Saqlanib qolishi kerak" }) });

        // Brauzer: joriy parol bilan DEK'ni ochadi, yangi parol bilan qayta o'raydi
        const current = await main.currentAuthKey(password);
        const dek = await vaultCrypto.unwrapDataKey(current.wrapKey, current.account.vault.wrappedKey);
        const kdfSalt = vaultCrypto.newSalt();
        const next = await vaultCrypto.derivePasswordKeys("Yangi-Parol-2027", kdfSalt, TEST_ITERATIONS);

        const wrongCurrent = await main.put("/api/account/password", {
            currentAuthKey: next.authKey,
            kdfSalt,
            kdfIterations: TEST_ITERATIONS,
            authKey: next.authKey,
            wrappedKey: await vaultCrypto.wrapDataKey(next.wrapKey, dek),
        });
        assert.equal(wrongCurrent.status, 403);

        const changed = await main.put("/api/account/password", {
            currentAuthKey: current.authKey,
            kdfSalt,
            kdfIterations: TEST_ITERATIONS,
            authKey: next.authKey,
            wrappedKey: await vaultCrypto.wrapDataKey(next.wrapKey, dek),
        });
        assert.equal(changed.status, 204);

        assert.equal((await other.get("/api/auth/me")).status, 401, "boshqa sessiya yopilishi kerak");
        assert.equal((await main.get("/api/auth/me")).status, 200, "joriy sessiya qolishi kerak");
        assert.equal((await client().login(email, password)).response.status, 401);

        const fresh = client();
        assert.equal((await fresh.login(email, "Yangi-Parol-2027")).response.status, 200);
        const record = (await fresh.get("/api/items")).body.items.find((r) => r.id === id);
        assert.equal((await fresh.decryptItem(record)).title, "Saqlanib qolishi kerak");
    });

    test("tiklash kaliti bilan parolni tiklash", async () => {
        const c = client();
        const { recoveryKey } = await c.register("unutuvchan@example.uz", "Birinchi-Parol-1");
        const id = crypto.randomUUID();
        await c.post("/api/items", { id, ciphertext: await c.encryptItem({ id, title: "Muhim" }) });

        const stranger = client();
        const recovery = await vaultCrypto.deriveRecoveryKeys(recoveryKey);
        const badKey = await vaultCrypto.deriveRecoveryKeys(vaultCrypto.generateRecoveryKey());
        const denied = await stranger.post("/api/auth/recovery/challenge", { email: "unutuvchan@example.uz", recoveryAuthKey: badKey.authKey });
        assert.equal(denied.status, 401);

        const challenge = await stranger.post("/api/auth/recovery/challenge", {
            email: "unutuvchan@example.uz",
            recoveryAuthKey: recovery.authKey,
        });
        assert.equal(challenge.status, 200);
        const dek = await vaultCrypto.unwrapDataKey(recovery.wrapKey, challenge.body.recoveryWrappedKey);

        const kdfSalt = vaultCrypto.newSalt();
        const next = await vaultCrypto.derivePasswordKeys("Ikkinchi-Parol-2", kdfSalt, TEST_ITERATIONS);
        const newRecovery = await vaultCrypto.deriveRecoveryKeys(vaultCrypto.generateRecoveryKey());
        const reset = await stranger.post("/api/auth/recovery/reset", {
            email: "unutuvchan@example.uz",
            recoveryAuthKey: recovery.authKey,
            kdfSalt,
            kdfIterations: TEST_ITERATIONS,
            authKey: next.authKey,
            wrappedKey: await vaultCrypto.wrapDataKey(next.wrapKey, dek),
            newRecoveryAuthKey: newRecovery.authKey,
            newRecoveryWrappedKey: await vaultCrypto.wrapDataKey(newRecovery.wrapKey, dek),
        });
        assert.equal(reset.status, 200);
        assert.equal((await c.get("/api/auth/me")).status, 401, "eski sessiyalar yopiladi");

        // Eski tiklash kaliti endi ishlamaydi
        const reuse = await client().post("/api/auth/recovery/challenge", { email: "unutuvchan@example.uz", recoveryAuthKey: recovery.authKey });
        assert.equal(reuse.status, 401);

        const fresh = client();
        assert.equal((await fresh.login("unutuvchan@example.uz", "Ikkinchi-Parol-2")).response.status, 200);
        const record = (await fresh.get("/api/items")).body.items.find((r) => r.id === id);
        assert.equal((await fresh.decryptItem(record)).title, "Muhim");
    });

    test("sessiyalar ro'yxati va bekor qilish", async () => {
        const a = client();
        await a.register("seans@example.uz", "Seans-Parol-123");
        const b = client();
        await b.login("seans@example.uz", "Seans-Parol-123");

        const list = await a.get("/api/account/sessions");
        assert.equal(list.body.sessions.length, 2);
        const otherSession = list.body.sessions.find((s) => !s.current);

        assert.equal((await a.delete(`/api/account/sessions/${otherSession.id}`)).status, 204);
        assert.equal((await b.get("/api/auth/me")).status, 401);
        assert.equal((await a.delete("/api/account/sessions/999999")).status, 404);
    });

    test("sozlamalar shifrlangan holda saqlanadi", async () => {
        const c = client();
        await c.register("sozlama@example.uz", "Sozlama-Parol-1");
        const encryptedSettings = await vaultCrypto.encryptJSON(c.dataKey, { theme: "dark" }, "vault:settings");
        assert.equal((await c.put("/api/account/settings", { encryptedSettings })).status, 204);
        const me = await c.get("/api/auth/me");
        assert.deepEqual(await vaultCrypto.decryptJSON(c.dataKey, me.body.encryptedSettings, "vault:settings"), { theme: "dark" });
    });

    test("hisobni o'chirish — barcha ma'lumotlar bilan birga", async () => {
        const c = client();
        await c.register("ketaman@example.uz", "Ketaman-Parol-1");
        const id = crypto.randomUUID();
        await c.post("/api/items", { id, ciphertext: await c.encryptItem({ id }) });
        const { authKey } = await c.currentAuthKey("Ketaman-Parol-1");

        const wrong = await vaultCrypto.derivePasswordKeys("Notogri-Parol-1", vaultCrypto.newSalt(), TEST_ITERATIONS);
        assert.equal((await c.delete("/api/account", { currentAuthKey: wrong.authKey })).status, 403);
        assert.equal((await c.delete("/api/account", { currentAuthKey: authKey })).status, 204);

        const [items] = await pool.query("SELECT COUNT(*) AS n FROM items WHERE id = ?", [id]);
        assert.equal(Number(items[0].n), 0);
        assert.equal((await client().login("ketaman@example.uz", "Ketaman-Parol-1")).response.status, 401);
    });
});

describe("AI maslahatchi", () => {
    test("kalit sozlanmagan bo'lsa — o'chiq holat va 503", async () => {
        const c = client();
        await c.register("ai@example.uz", "Ai-Parol-12345");
        const status = await c.get("/api/ai/status");
        assert.equal(status.body.enabled, false);
        const chat = await c.post("/api/ai/chat", { messages: [{ role: "user", content: "Salom" }] });
        assert.equal(chat.status, 503);
    });
});

describe("admin panel", () => {
    let admin;
    let otherAdmin;
    let user;
    let userId;

    before(async () => {
        admin = client();
        await admin.register("Boss@Example.uz", "Boss-Parol-2026!");
        otherAdmin = client();
        await otherAdmin.register("boss2@example.uz", "Boss2-Parol-2026!");
        user = client();
        const { response } = await user.register("oddiy@example.uz", "Oddiy-Parol-2026!");
        userId = response.body.user.id;
        const id = crypto.randomUUID();
        await user.post("/api/items", { id, ciphertext: await user.encryptItem({ id, title: "Shaxsiy sir" }) });
    });

    test("isAdmin belgisi faqat ADMIN_EMAILS dagilar uchun", async () => {
        assert.equal((await admin.get("/api/auth/me")).body.user.isAdmin, true);
        assert.equal((await user.get("/api/auth/me")).body.user.isAdmin, false);
    });

    test("oddiy foydalanuvchi va mehmon admin API'ga kira olmaydi", async () => {
        assert.equal((await user.get("/api/admin/stats")).status, 403);
        assert.equal((await user.get("/api/admin/users")).status, 403);
        assert.equal((await client().get("/api/admin/stats")).status, 401);
    });

    test("statistika va foydalanuvchilar ro'yxati — faqat metadata, shifr yo'q", async () => {
        const stats = await admin.get("/api/admin/stats");
        assert.equal(stats.status, 200);
        assert.ok(stats.body.users >= 3);
        assert.ok(stats.body.storage_bytes > 0);
        assert.ok(stats.body.database_bytes > 0);

        const list = await admin.get("/api/admin/users?query=oddiy");
        assert.equal(list.body.total, 1);
        const [row] = list.body.users;
        assert.equal(row.email, "oddiy@example.uz");
        assert.equal(row.itemCount, 1);
        assert.ok(row.storageBytes > 0);
        assert.equal(row.isAdmin, false);
        assert.ok(!JSON.stringify(list.body).includes("v1."), "shifrlangan mazmun qaytarilmasligi kerak");
    });

    test("bloklash: sessiyalar yopiladi, kirish rad etiladi (to'g'ri parolda ham); blokdan chiqarish", async () => {
        const disabled = await admin.post(`/api/admin/users/${userId}/disable`);
        assert.equal(disabled.status, 200);
        assert.ok(disabled.body.disabledAt);
        assert.equal((await user.get("/api/auth/me")).status, 401);

        const wrong = await client().login("oddiy@example.uz", "Notogri-Parol-1");
        assert.equal(wrong.response.status, 401, "noto'g'ri parolda bloklanganlik oshkor qilinmaydi");
        const blocked = await client().login("oddiy@example.uz", "Oddiy-Parol-2026!");
        assert.equal(blocked.response.status, 403);
        assert.match(blocked.response.body.error.message, /blocked by an administrator/);

        assert.equal((await admin.post(`/api/admin/users/${userId}/enable`)).status, 200);
        assert.equal((await user.login("oddiy@example.uz", "Oddiy-Parol-2026!")).response.status, 200);
    });

    test("barcha qurilmalardan chiqarish va jurnal", async () => {
        const revoked = await admin.delete(`/api/admin/users/${userId}/sessions`);
        assert.equal(revoked.status, 200);
        assert.ok(revoked.body.revoked >= 1);
        assert.equal((await user.get("/api/auth/me")).status, 401);

        const audit = await admin.get(`/api/admin/audit?userId=${userId}`);
        const events = audit.body.events.map((e) => e.event);
        for (const event of ["account_disabled", "account_enabled", "login_blocked", "sessions_revoked_by_admin"]) {
            assert.ok(events.includes(event), `${event} jurnalda bo'lishi kerak`);
        }
        assert.equal(audit.body.events[0].user.email, "oddiy@example.uz");

        const failed = await admin.get("/api/admin/audit?event=login_failed");
        assert.ok(failed.body.events.every((e) => e.event === "login_failed"));
    });

    test("admin o'zini va boshqa adminni bloklay/o'chira olmaydi", async () => {
        const self = (await admin.get("/api/auth/me")).body.user.id;
        const other = (await otherAdmin.get("/api/auth/me")).body.user.id;
        assert.equal((await admin.post(`/api/admin/users/${self}/disable`)).status, 403);
        assert.equal((await admin.delete(`/api/admin/users/${other}`)).status, 403);
        assert.equal((await admin.post("/api/admin/users/999999/disable")).status, 404);
    });

    test("foydalanuvchini o'chirish — barcha ma'lumotlari bilan", async () => {
        assert.equal((await admin.delete(`/api/admin/users/${userId}`)).status, 204);
        const [rows] = await pool.query("SELECT COUNT(*) AS n FROM items WHERE user_id = ?", [userId]);
        assert.equal(Number(rows[0].n), 0);
        assert.equal((await admin.get("/api/admin/users?query=oddiy")).body.total, 0);
    });
});
