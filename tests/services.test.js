import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setLanguage } from "../public/js/core/i18n.js";
import { buildItem } from "../public/js/models/types.js";
import * as a from "../public/js/services/analytics.js";
import { generateInsights } from "../public/js/services/insights.js";
import { normalize, searchItems } from "../public/js/services/search.js";
import { generatePassword, passwordStrength } from "../public/js/ui/password-tools.js";

const task = (data) => buildItem("task", { title: "Vazifa", ...data });

describe("analytics", () => {
    test("sana arifmetikasi, oy oxiri bilan", () => {
        assert.equal(a.addDays("2026-02-28", 1), "2026-03-01");
        assert.equal(a.addMonths("2026-01-31", 1), "2026-02-28");
        assert.equal(a.daysBetween("2026-10-01", "2026-10-23"), 22);
    });

    test("vazifalarni muddat bo'yicha guruhlash va tartiblash", () => {
        const today = "2026-10-23";
        const groups = a.groupTasks(
            [
                task({ title: "kech", dueDate: "2026-10-20" }),
                task({ title: "bugun-past", dueDate: today, priority: "low" }),
                task({ title: "bugun-shoshilinch", dueDate: today, priority: "urgent" }),
                task({ title: "ertaga", dueDate: "2026-10-24" }),
                task({ title: "muddatsiz" }),
                task({ title: "tayyor", status: "done", dueDate: "2026-10-01" }),
            ],
            today
        );
        assert.deepEqual(groups.map((g) => g.key), ["overdue", "today", "tomorrow", "nodate", "done"]);
        assert.deepEqual(groups[1].items.map((t) => t.title), ["bugun-shoshilinch", "bugun-past"]);
    });

    test("takrorlanuvchi vazifa: keyingi muddat bugundan keyin", () => {
        assert.equal(a.nextOccurrence("2026-10-20", "daily", "2026-10-23"), "2026-10-24");
        assert.equal(a.nextOccurrence("2026-10-20", "weekly", "2026-10-23"), "2026-10-27");
        assert.equal(a.nextOccurrence("2026-08-31", "monthly", "2026-10-23"), "2026-10-31");
        assert.equal(a.nextOccurrence("2026-10-20", "none", "2026-10-23"), null);
    });

    test("kundalik streak: bugungi yozuv bo'lmasa kechagidan sanaladi", () => {
        const entries = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-10", "2026-10-11"].map((date) => ({ date }));
        assert.deepEqual(a.journalStreak(entries, "2026-10-23"), { current: 3, longest: 3, hasToday: false, total: 5 });
        assert.equal(a.journalStreak(entries, "2026-10-25").current, 0);
    });

    test("loyiha progressi bog'langan vazifalardan", () => {
        const project = buildItem("project", { title: "Sayt" });
        const tasks = [
            task({ projectId: project.id, status: "done" }),
            task({ projectId: project.id }),
            task({ projectId: project.id }),
            task({}),
        ];
        assert.deepEqual(
            (({ done, total, percent }) => ({ done, total, percent }))(a.projectProgress(project, tasks)),
            { done: 1, total: 3, percent: 33 }
        );
    });
});

describe("search", () => {
    const items = [
        buildItem("note", { title: "JavaScript o'qish rejasi", body: "Promise va async haqida", tags: ["dasturlash"] }),
        buildItem("note", { title: "Xarid ro'yxati", body: "non, sut, javascript kitobi" }),
        buildItem("secret", { title: "Gmail", username: "men@gmail.com", password: "javascript-parol" }),
    ];

    test("apostrofga chidamli normallashtirish", () => {
        assert.equal(normalize("Oʻqish"), normalize("o'qish"));
        assert.equal(normalize("O‘ZBEK"), "ozbek");
    });

    test("sarlavhadagi moslik yuqoriroq, barcha so'zlar topilishi kerak", () => {
        const results = searchItems(items, "javascript");
        assert.equal(results[0].item.title, "JavaScript o'qish rejasi");
        assert.equal(results.length, 2, "maxfiy yozuvning paroli indekslanmasligi kerak");
        assert.equal(searchItems(items, "javascript sut").length, 1);
        assert.equal(searchItems(items, "oqish")[0].item.title, "JavaScript o'qish rejasi");
    });

    test("#teg filtri", () => {
        assert.deepEqual(searchItems(items, "#dasturlash").map((r) => r.item.title), ["JavaScript o'qish rejasi"]);
        assert.equal(searchItems(items, "#yoq").length, 0);
    });
});

describe("parol vositalari", () => {
    test("kuch bahosi", () => {
        assert.equal(passwordStrength("123456").score, 0);
        assert.ok(passwordStrength("aaaaaaaaaaaa").score <= 1);
        assert.ok(passwordStrength("Tr0ub4dor&3-xyz-Qp!").score >= 3);
    });

    test("generator: uzunlik, to'plamlar, tasodifiylik", () => {
        const password = generatePassword({ length: 24 });
        assert.equal(password.length, 24);
        assert.match(password, /[a-z]/);
        assert.match(password, /[A-Z]/);
        assert.match(password, /\d/);
        assert.match(password, /[^A-Za-z0-9]/);
        assert.notEqual(generatePassword(), generatePassword());
        assert.match(generatePassword({ length: 12, upper: false, digits: false, symbols: false }), /^[a-z]{12}$/);
    });
});

describe("insights", () => {
    const now = new Date(2026, 9, 23, 12);

    test("bo'sh vault — boshlash bo'yicha maslahat", () => {
        assert.deepEqual(generateInsights([], { now }).map((i) => i.id), ["welcome"]);
    });

    test("kechikkan vazifa, keyingi qadamsiz loyiha, zaif va takror parollar", () => {
        const project = buildItem("project", { title: "Portfolio", status: "active" });
        const items = [
            task({ dueDate: "2026-10-01" }),
            project,
            buildItem("secret", { title: "A", password: "123456" }),
            buildItem("secret", { title: "B", password: "123456" }),
        ];
        const ids = generateInsights(items, { now }).map((i) => i.id);
        assert.ok(ids.includes("tasks-overdue"));
        assert.ok(ids.includes(`project-no-next-step-${project.id}`));
        assert.ok(ids.includes("secrets-weak"));
        assert.ok(ids.includes("secrets-reused"));
        assert.equal(generateInsights(items, { now })[0].tone, "danger", "eng muhimlari birinchi");
    });

    test("kundalik streak tabriklanadi (uch tilda, to'g'ri ko'plik shakli bilan)", () => {
        const entries = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((date) => buildItem("journal", { date, mood: 4 }));
        const title = () => generateInsights(entries, { now }).find((i) => i.id === "journal-streak").title;
        try {
            setLanguage("uz");
            assert.equal(title(), "Kundalik: 4 kun ketma-ket!");
            setLanguage("ru");
            assert.equal(title(), "Дневник: 4 дня подряд!");
            setLanguage("en");
            assert.equal(title(), "Journal: 4 days in a row!");
        } finally {
            setLanguage("en");
        }
    });
});

describe("tezkor yozish", async () => {
    const { parseQuickInput } = await import("../public/js/services/quick-capture.js");
    const today = "2026-10-23"; // juma

    test("vazifa: muddat, muhimlik va teglar", () => {
        assert.deepEqual(parseQuickInput("Hisobotni topshirish ertaga !! #ish", { today }), {
            type: "task",
            data: { title: "Hisobotni topshirish ertaga", tags: ["ish"], dueDate: "2026-10-24", priority: "urgent" },
        });
    });

    test("hafta kuni eng yaqin kelgusi kunga aylanadi", () => {
        assert.equal(parseQuickInput("dushanba kuni kitob o'qish", { today }).data.dueDate, "2026-10-26");
        assert.equal(parseQuickInput("juma uchrashuv", { today }).data.dueDate, "2026-10-30");
    });

    test("inglizcha va ruscha kalit so'zlar ham tushuniladi", () => {
        assert.deepEqual(parseQuickInput("Send report tomorrow ! #work", { today }), {
            type: "task",
            data: { title: "Send report tomorrow", tags: ["work"], dueDate: "2026-10-24", priority: "high" },
        });
        assert.equal(parseQuickInput("Отчёт завтра", { today }).data.dueDate, "2026-10-24");
        assert.equal(parseQuickInput("Позвонить послезавтра", { today }).data.dueDate, "2026-10-25", "«послезавтра» ichidagi «завтра» chalg'itmasin");
        assert.equal(parseQuickInput("call mom on monday", { today }).data.dueDate, "2026-10-26");
        assert.equal(parseQuickInput("встреча в пятницу #работа", { today }).data.dueDate, "2026-10-30");
        assert.deepEqual(parseQuickInput("встреча в пятницу #работа", { today }).data.tags, ["работа"]);
        assert.equal(parseQuickInput("заметка: новая идея", { today }).type, "note");
        assert.equal(parseQuickInput("journal: good day", { today }).type, "journal");
        assert.equal(parseQuickInput("Sunday dinner", { today }).data.dueDate, "2026-10-25");
    });

    test("URL — havola; prefiks — tur", () => {
        const link = parseQuickInput("https://developer.mozilla.org MDN #js", { today });
        assert.equal(link.type, "link");
        assert.equal(link.data.url, "https://developer.mozilla.org");
        assert.equal(link.data.title, "MDN");
        assert.equal(parseQuickInput("fikr: yangi g'oya", { today }).type, "note");
        assert.equal(parseQuickInput("oddiy matn", { today, defaultType: "note" }).type, "note");
    });
});

describe("markdown xavfsizligi", async () => {
    const { markdownToHtml } = await import("../public/js/ui/markdown.js");

    test("HTML teglari escape qilinadi", () => {
        const html = markdownToHtml('<img src=x onerror="alert(1)"> **qalin**');
        assert.ok(!html.includes("<img"));
        assert.ok(html.includes("&lt;img"));
        assert.ok(html.includes("<strong>qalin</strong>"));
    });

    test("javascript: havolalar bloklanadi, https ruxsat etiladi", () => {
        assert.ok(!markdownToHtml("[bos](javascript:alert(1))").includes("href"));
        assert.ok(markdownToHtml("[MDN](https://developer.mozilla.org)").includes('href="https://developer.mozilla.org"'));
        assert.ok(!markdownToHtml('[x](https://a.uz/"onmouseover="alert(1))').includes('"onmouseover'));
    });

    test("ro'yxat, vazifa va kod bloklari", () => {
        const html = markdownToHtml("- [x] bajarildi\n- [ ] qoldi\n\n```\n<b>kod</b>\n```");
        assert.ok(html.includes('class="task-list"'));
        assert.ok(html.includes("&lt;b&gt;kod&lt;/b&gt;"));
    });
});
