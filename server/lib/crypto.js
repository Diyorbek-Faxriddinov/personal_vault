/**
 * Server tomonidagi kriptografiya.
 *
 * Server foydalanuvchi ma'lumotlarini hech qachon ochmaydi (zero-knowledge). Bu yerda faqat:
 *  - brauzer yuborgan "authKey"ni scrypt bilan xeshlash (parolning o'zi serverga kelmaydi),
 *  - sessiya tokenlarini yaratish va xeshlash,
 *  - noma'lum emaillar uchun soxta, lekin barqaror KDF salt (email mavjudligini oshkor qilmaslik uchun).
 */
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 32, maxmem: 64 * 1024 * 1024 };

/** "scrypt$N$r$p$salt$hash" formatida saqlanadi — parametrlar keyin o'zgarsa ham eski xeshlar ishlaydi */
export async function hashSecret(secret) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(secret, salt, SCRYPT.keyLength, SCRYPT);
    return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifySecret(secret, stored) {
    const [algorithm, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (algorithm !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(secret, Buffer.from(saltB64, "base64"), expected.length, {
        N: Number(N),
        r: Number(r),
        p: Number(p),
        maxmem: SCRYPT.maxmem,
    });
    return crypto.timingSafeEqual(actual, expected);
}

/** Taqqoslash vaqti hisobidan "bunday foydalanuvchi bormi" degan ma'lumot sizib chiqmasligi uchun */
let dummyHash = null;
export async function verifyAgainstDummy(secret) {
    dummyHash ??= await hashSecret(crypto.randomBytes(32).toString("base64"));
    await verifySecret(secret, dummyHash);
    return false;
}

export const generateToken = () => crypto.randomBytes(32).toString("base64url");

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest();

export function fakeKdfSalt(appSecret, email) {
    return crypto.createHmac("sha256", appSecret).update(`kdf-salt:${email}`).digest().subarray(0, 16).toString("base64");
}
