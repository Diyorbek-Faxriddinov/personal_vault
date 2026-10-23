/**
 * Kriptografiya (faqat brauzerning o'rnatilgan WebCrypto API'si, tashqi kutubxonasiz).
 *
 * Kalitlar ierarxiyasi:
 *
 *   master parol ──PBKDF2-SHA256 (600 000 marta)──▶ master kalit
 *        master kalit ──HKDF "auth"──▶ authKey   → serverga kirish uchun (server faqat xeshini saqlaydi)
 *        master kalit ──HKDF "wrap"──▶ wrapKey   → DEK'ni shifrlaydi, brauzerdan chiqmaydi
 *
 *   DEK (tasodifiy 256-bit) ──AES-256-GCM──▶ har bir yozuv, sozlamalar
 *   tiklash kaliti ──HKDF──▶ recovery authKey + recovery wrapKey (xuddi shu DEK'ning ikkinchi nusxasi)
 *
 * Parol almashtirilganda DEK o'zgarmaydi, faqat qayta shifrlanadi — yozuvlarni qayta shifrlash shart emas.
 * Har bir shifrlangan blok AAD (qo'shimcha autentifikatsiya ma'lumoti) bilan bog'langan: masalan, yozuv
 * o'z id'siga bog'lanadi, shuning uchun server bloklarni yozuvlar o'rtasida almashtirib qo'ya olmaydi.
 */

import { t } from "./i18n.js";

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const KDF_ITERATIONS = 600_000;
const FORMAT = "v1";
const HKDF_SALT = encoder.encode("shaxsiy-vault/hkdf/v1");
const IV_BYTES = 12;

export class DecryptionError extends Error {
    constructor(message = t("crypto.decryptFailed")) {
        super(message);
        this.name = "DecryptionError";
    }
}

// ─── Baytlar bilan ishlash ──────────────────────────────────────────

export const randomBytes = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));

export function toBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

export function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export const newSalt = () => toBase64(randomBytes(16));

// ─── Kalitlarni hosil qilish ────────────────────────────────────────

async function pbkdf2(password, salt, iterations) {
    const baseKey = await subtle.importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, [
        "deriveBits",
    ]);
    const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, baseKey, 256);
    return new Uint8Array(bits);
}

const importHkdf = (bytes) => subtle.importKey("raw", bytes, "HKDF", false, ["deriveBits", "deriveKey"]);

async function hkdfBytes(baseKey, info) {
    const bits = await subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(info) },
        baseKey,
        256
    );
    return new Uint8Array(bits);
}

const hkdfAesKey = (baseKey, info) =>
    subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(info) },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

/** Master paroldan authKey (base64) va wrapKey (CryptoKey) hosil qiladi */
export async function derivePasswordKeys(password, saltBase64, iterations) {
    const master = await pbkdf2(password, fromBase64(saltBase64), iterations);
    const base = await importHkdf(master);
    master.fill(0);
    const [authBytes, wrapKey] = await Promise.all([hkdfBytes(base, "vault:auth"), hkdfAesKey(base, "vault:wrap")]);
    return { authKey: toBase64(authBytes), wrapKey };
}

/** Tiklash kalitidan (matn ko'rinishida) shunga o'xshash juftlik hosil qiladi */
export async function deriveRecoveryKeys(recoveryKey) {
    const base = await importHkdf(decodeRecoveryKey(recoveryKey));
    const [authBytes, wrapKey] = await Promise.all([
        hkdfBytes(base, "vault:recovery-auth"),
        hkdfAesKey(base, "vault:recovery-wrap"),
    ]);
    return { authKey: toBase64(authBytes), wrapKey };
}

// ─── Shifrlash / ochish ─────────────────────────────────────────────

/** Natija: "v1.<iv>.<ciphertext+tag>" (base64) */
export async function encryptBytes(key, bytes, aad) {
    const iv = randomBytes(IV_BYTES);
    const params = { name: "AES-GCM", iv, ...(aad ? { additionalData: encoder.encode(aad) } : {}) };
    const ciphertext = new Uint8Array(await subtle.encrypt(params, key, bytes));
    return `${FORMAT}.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

export async function decryptBytes(key, payload, aad) {
    const [format, ivPart, dataPart] = String(payload).split(".");
    if (format !== FORMAT || !ivPart || !dataPart) throw new DecryptionError(t("crypto.unknownFormat"));
    try {
        const params = { name: "AES-GCM", iv: fromBase64(ivPart), ...(aad ? { additionalData: encoder.encode(aad) } : {}) };
        return new Uint8Array(await subtle.decrypt(params, key, fromBase64(dataPart)));
    } catch {
        throw new DecryptionError();
    }
}

export const encryptJSON = (key, value, aad) => encryptBytes(key, encoder.encode(JSON.stringify(value)), aad);

export async function decryptJSON(key, payload, aad) {
    return JSON.parse(decoder.decode(await decryptBytes(key, payload, aad)));
}

// ─── Ma'lumot kaliti (DEK) ──────────────────────────────────────────

const DEK_AAD = "vault:dek";

export const generateDataKeyBytes = () => randomBytes(32);

/** DEK xotirada "eksport qilib bo'lmaydigan" kalit sifatida saqlanadi */
export const importDataKey = (bytes) => subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const wrapDataKey = (wrapKey, dekBytes) => encryptBytes(wrapKey, dekBytes, DEK_AAD);

export const unwrapDataKey = (wrapKey, wrapped) => decryptBytes(wrapKey, wrapped, DEK_AAD);

// ─── Tiklash kaliti: 256 bit, Crockford base32, 4 belgidan guruhlangan ─

const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_CHARS = 52; // ceil(256 / 5)

export function generateRecoveryKey() {
    return encodeRecoveryKey(randomBytes(32));
}

export function encodeRecoveryKey(bytes) {
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
    return output.match(/.{1,4}/g).join("-");
}

export function decodeRecoveryKey(text) {
    const clean = String(text)
        .toUpperCase()
        .replace(/[\s-]/g, "")
        .replace(/O/g, "0")
        .replace(/[IL]/g, "1");
    if (clean.length !== RECOVERY_CHARS || [...clean].some((char) => !BASE32.includes(char))) {
        throw new DecryptionError(t("crypto.recoveryFormat"));
    }
    const bytes = new Uint8Array(32);
    let bits = 0;
    let value = 0;
    let index = 0;
    for (const char of clean) {
        value = (value << 5) | BASE32.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }
    return bytes;
}
