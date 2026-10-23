import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DICTIONARIES, getLanguage, LANGUAGES, setLanguage, t } from "../public/js/core/i18n.js";
import * as types from "../public/js/models/types.js";
import { TASK_BUCKETS } from "../public/js/services/analytics.js";
import { CONTEXT_SECTIONS } from "../public/js/services/ai.js";
import { formatDate, formatMonthYear, relativeTime } from "../public/js/ui/format.js";
import { passwordStrength } from "../public/js/ui/password-tools.js";
import { SERVER_MESSAGES } from "../server/lib/i18n.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODES = LANGUAGES.map((language) => language.code);
const placeholders = (value) =>
    [...new Set((typeof value === "object" ? Object.values(value).join(" ") : value).match(/\{\w+\}/g) ?? [])].sort();

/** Bir tilda ishlatib ko'radi va oxirida ingliz tiliga qaytaradi */
function inEach(fn) {
    try {
        for (const code of CODES) {
            setLanguage(code);
            fn(code);
        }
    } finally {
        setLanguage("en");
    }
}

function sourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "locales" ? [] : sourceFiles(full);
        return entry.name.endsWith(".js") ? [full] : [];
    });
}

describe("lug'atlar (frontend)", () => {
    test("uch tilda ham aynan bir xil kalitlar", () => {
        const reference = Object.keys(DICTIONARIES.en).sort();
        for (const code of CODES) {
            assert.deepEqual(Object.keys(DICTIONARIES[code]).sort(), reference, `${code} lug'ati to'liq emas`);
        }
    });

    test("har bir kalitda {parametr}lar barcha tillarda bir xil", () => {
        for (const [key, value] of Object.entries(DICTIONARIES.en)) {
            for (const code of CODES) {
                assert.deepEqual(placeholders(DICTIONARIES[code][key]), placeholders(value), `${code}: ${key}`);
            }
        }
    });

    test("ko'plik shakllari: har doim 'other'; rus tilida one/few/many ham", () => {
        for (const code of CODES) {
            for (const [key, value] of Object.entries(DICTIONARIES[code])) {
                if (typeof value === "string") continue;
                assert.ok(value.other, `${code}: ${key} — 'other' shakli yo'q`);
                if (code === "ru") assert.ok(value.one && value.few && value.many, `ru: ${key} — shakllar to'liq emas`);
                if (code === "en") assert.ok(value.one, `en: ${key} — 'one' shakli yo'q`);
            }
        }
    });

    test("kodda ishlatilgan har bir t(\"...\") kaliti lug'atda bor", () => {
        const missing = [];
        for (const file of sourceFiles(path.join(ROOT, "public/js"))) {
            const code = fs.readFileSync(file, "utf8");
            for (const [, key] of code.matchAll(/\bt\("([^"]+)"/g)) {
                if (!(key in DICTIONARIES.en)) missing.push(`${path.relative(ROOT, file)}: ${key}`);
            }
        }
        assert.deepEqual(missing, []);
    });

    test("dinamik kalitlar (turlar, holatlar, kayfiyat, ...) hamma tilda tarjima qilingan", () => {
        const looksLikeKey = (text) => /^[a-zA-Z]+\.[\w.]+$/.test(text);
        inEach((code) => {
            const values = [
                ...types.TYPE_ORDER.flatMap((key) => {
                    const type = types.TYPES[key];
                    return [type.label, type.plural, type.description, ...["new", "add", "added", "empty"].map((s) => t(`types.${key}.${s}`)), ...type.fields.map((field) => field.label)];
                }),
                ...[types.TASK_STATUS, types.PRIORITY, types.RECURRENCE, types.PROJECT_STATUS, types.LEARNING_KIND, types.LEARNING_STATUS].flatMap(Object.values),
                ...types.MOODS.map((mood) => mood.label),
                ...TASK_BUCKETS.map((bucket) => bucket.label),
                ...Object.values(CONTEXT_SECTIONS),
                ...[0, 1, 2, 3, 4].map((score) => t(`strength.${score}`)),
                ...["updated", "created", "title", "date", "deadline"].map((key) => t(`sort.${key}`)),
                ...[1, 2, 3, 4].map((n) => t(`advisor.suggest.${n}`)),
            ];
            assert.deepEqual(values.filter(looksLikeKey), [], `${code}: tarjimasiz kalitlar`);
        });
    });

    test("til almashganda yorliqlar darhol o'zgaradi", () => {
        inEach((code) => {
            const expected = { en: "Tasks", uz: "Vazifalar", ru: "Задачи" }[code];
            assert.equal(types.TYPES.task.plural, expected);
            assert.equal(getLanguage(), code);
        });
    });

    test("ko'plik va parametrlar", () => {
        inEach((code) => {
            const forms = [1, 2, 5, 21].map((count) => t("common.itemsCount", { count }));
            const expected = {
                en: ["1 item", "2 items", "5 items", "21 items"],
                uz: ["1 ta yozuv", "2 ta yozuv", "5 ta yozuv", "21 ta yozuv"],
                ru: ["1 запись", "2 записи", "5 записей", "21 запись"],
            }[code];
            assert.deepEqual(forms, expected);
        });
    });

    test("noma'lum kalit — kalitning o'zi; noma'lum til tanlanmaydi", () => {
        assert.equal(t("no.such.key"), "no.such.key");
        setLanguage("de");
        assert.equal(getLanguage(), "en");
    });

    test("sana formatlari tilga mos", () => {
        const now = new Date(2026, 9, 23, 12);
        inEach((code) => {
            const date = formatDate("2025-10-23");
            const month = formatMonthYear(2026, 9);
            const ago = relativeTime(new Date(2026, 9, 20, 12), now);
            const expected = {
                en: [/October 23, 2025/, /October 2026/, "3 days ago"],
                uz: [/^23-oktabr, 2025$/, /^oktabr 2026$/, "3 kun oldin"],
                ru: [/23 октября 2025/, /Октябрь 2026/, "3 дня назад"],
            }[code];
            assert.match(date, expected[0]);
            assert.match(month, expected[1]);
            assert.equal(ago, expected[2]);
        });
    });

    test("parol kuchi yorlig'i joriy tilda", () => {
        inEach((code) => {
            assert.equal(passwordStrength("123456").label, { en: "Very weak", uz: "Juda zaif", ru: "Очень слабый" }[code]);
        });
    });
});

describe("lug'atlar (server)", () => {
    test("uch tilda bir xil kalitlar va {parametr}lar", () => {
        const reference = Object.keys(SERVER_MESSAGES.en).sort();
        for (const code of CODES) {
            assert.deepEqual(Object.keys(SERVER_MESSAGES[code]).sort(), reference, `server: ${code}`);
            for (const key of reference) {
                assert.deepEqual(placeholders(SERVER_MESSAGES[code][key]), placeholders(SERVER_MESSAGES.en[key]), `server ${code}: ${key}`);
            }
        }
    });

    test("serverda ishlatilgan har bir xabar kaliti lug'atda bor", () => {
        const missing = [];
        for (const file of sourceFiles(path.join(ROOT, "server"))) {
            const code = fs.readFileSync(file, "utf8");
            for (const [, key] of code.matchAll(/["'`]((?:errors|validation|ai)\.[a-zA-Z]+)["'`]/g)) {
                if (!(key in SERVER_MESSAGES.en)) missing.push(`${path.relative(ROOT, file)}: ${key}`);
            }
        }
        assert.deepEqual(missing, []);
    });
});
