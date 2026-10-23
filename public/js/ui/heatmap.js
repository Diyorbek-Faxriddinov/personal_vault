/**
 * Kundalik issiqlik xaritasi (GitHub uslubida): har bir katak — bir kun, rangi — kayfiyat.
 * Katakka bosilsa o'sha kungi yozuv ochiladi (yoki yangisi yaratiladi).
 */
import { t } from "../core/i18n.js";
import { MOODS } from "../models/types.js";
import { addDays, todayISO } from "../services/analytics.js";
import { h } from "./dom.js";
import { formatDate, monthShort, weekdayShort } from "./format.js";

export function journalHeatmap(entries, { weeks = 20, hrefFor } = {}) {
    const today = todayISO();
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));

    // Dushanbadan boshlanadigan haftalar
    const todayDate = new Date(`${today}T00:00:00`);
    const offset = (todayDate.getDay() + 6) % 7;
    const start = addDays(today, -offset - (weeks - 1) * 7);

    const columns = [];
    const monthLabels = [];
    let lastMonth = null;
    for (let w = 0; w < weeks; w++) {
        const cells = [];
        for (let d = 0; d < 7; d++) {
            const date = addDays(start, w * 7 + d);
            if (date > today) {
                cells.push(h("span", { class: "heatmap__cell heatmap__cell--future" }));
                continue;
            }
            const entry = byDate.get(date);
            const mood = MOODS.find((m) => m.value === entry?.mood);
            const level = entry ? (entry.mood ?? 3) : 0;
            const label = `${formatDate(date, { withYear: true })}: ${entry ? (mood ? `${mood.emoji} ${mood.label}` : t("heatmap.hasEntry")) : t("heatmap.noEntry")}`;
            cells.push(h("a", { class: ["heatmap__cell", `heatmap__cell--${level}`, date === today && "is-today"], href: hrefFor(date, entry), title: label, "aria-label": label }));
        }
        const month = Number(addDays(start, w * 7).slice(5, 7)) - 1;
        monthLabels.push(h("span", { class: "heatmap__month" }, month !== lastMonth ? monthShort(month) : ""));
        lastMonth = month;
        columns.push(h("div", { class: "heatmap__week" }, cells));
    }

    return h(
        "div",
        { class: "heatmap" },
        h("div", { class: "heatmap__months" }, monthLabels),
        h(
            "div",
            { class: "heatmap__body" },
            h("div", { class: "heatmap__weekdays" }, [1, 3, 5].map((i) => h("span", { class: `heatmap__weekday heatmap__weekday--${i}` }, weekdayShort(i)))),
            h("div", { class: "heatmap__grid" }, columns)
        ),
        h(
            "div",
            { class: "heatmap__legend" },
            `${t("field.mood")}: `,
            MOODS.map((mood) => h("span", { class: `heatmap__cell heatmap__cell--${mood.value}`, title: mood.label })),
            " ",
            h("span", { class: "text-muted" }, "😞 → 😄")
        )
    );
}
