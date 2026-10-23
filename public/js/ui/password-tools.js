/**
 * Parol kuchini baholash va kriptografik tasodifiy parol yaratish (sof funksiyalar).
 */
import { t } from "../core/i18n.js";

const SETS = {
    lower: "abcdefghijkmnopqrstuvwxyz",
    upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    digits: "23456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};

const COMMON = new Set([
    "123456", "12345678", "123456789", "password", "parol", "qwerty", "qwerty123", "111111", "123123",
    "abc123", "iloveyou", "admin", "welcome", "000000", "parol123", "password1", "1q2w3e4r", "salom",
]);

/** 0..4 bahoning joriy tildagi nomi */
export const strengthLabel = (score) => t(`strength.${score}`);

/**
 * Taxminiy entropiya bo'yicha baho. score: 0..4
 * Takrorlanish, ketma-ketlik ("abcd", "1234") va mashhur parollar jarimalanadi.
 */
export function passwordStrength(password = "") {
    if (!password) return { score: 0, label: "", bits: 0 };
    if (COMMON.has(password.toLowerCase())) return { score: 0, label: strengthLabel(0), bits: 0 };

    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/\d/.test(password)) pool += 10;
    if (/[^A-Za-z0-9]/.test(password)) pool += 33;

    // Takrorlangan va ketma-ket belgilar "samarali uzunlik"ni kamaytiradi
    let effective = 0;
    for (let i = 0; i < password.length; i++) {
        const prev = password.charCodeAt(i - 1);
        const code = password.charCodeAt(i);
        const repeated = i > 0 && code === prev;
        const sequential = i > 0 && Math.abs(code - prev) === 1;
        effective += repeated ? 0.25 : sequential ? 0.5 : 1;
    }

    const bits = Math.round(effective * Math.log2(Math.max(pool, 1)));
    const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    return { score, label: strengthLabel(score), bits };
}

/** Rejection sampling — modul bo'yicha "og'ish" (bias) bo'lmaydi */
function randomIndex(max) {
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    const buffer = new Uint32Array(1);
    do globalThis.crypto.getRandomValues(buffer);
    while (buffer[0] >= limit);
    return buffer[0] % max;
}

export function generatePassword({ length = 20, lower = true, upper = true, digits = true, symbols = true } = {}) {
    const enabled = Object.entries({ lower, upper, digits, symbols })
        .filter(([, on]) => on)
        .map(([name]) => SETS[name]);
    if (!enabled.length) enabled.push(SETS.lower);

    // Har bir tanlangan to'plamdan kamida bitta belgi bo'lishini kafolatlaymiz
    const chars = enabled.map((set) => set[randomIndex(set.length)]);
    const all = enabled.join("");
    while (chars.length < length) chars.push(all[randomIndex(all.length)]);

    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
}
