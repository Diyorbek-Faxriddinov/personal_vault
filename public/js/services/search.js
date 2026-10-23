/**
 * To'liq matnli qidiruv — butunlay brauzerda, ochilgan ma'lumotlar ustida.
 * Server hech narsani ko'rmaydi, shuning uchun qidiruv ham maxfiy.
 *
 * Imkoniyatlar: bir nechta so'z (hammasi topilishi kerak), "#teg" filtri,
 * o'zbekcha apostroflarga chidamli (o'qish = oqish = oʻqish), sarlavhadagi moslik ustun.
 */
import { displayTitle } from "../models/types.js";

export function normalize(text) {
    return String(text ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/['ʻʼ‘’`´]/g, "")
        .toLowerCase();
}

/** Maxfiy yozuvlarda parol va izohlar indekslanmaydi */
function fieldsOf(item) {
    const base = {
        title: displayTitle(item),
        tags: (item.tags ?? []).join(" "),
    };
    if (item.type === "secret") return { ...base, other: [item.username, item.url].join(" ") };
    const subtasks = [...(item.subtasks ?? []), ...(item.milestones ?? [])].map((entry) => entry.text);
    return {
        ...base,
        other: [item.body, item.goal, item.description, item.url, item.collection, item.gratitude, ...subtasks]
            .filter(Boolean)
            .join(" "),
    };
}

const WEIGHTS = { title: 6, tags: 4, other: 1 };

export function parseQuery(query) {
    const tags = [];
    const terms = [];
    for (const token of String(query).trim().split(/\s+/).filter(Boolean)) {
        if (token.startsWith("#") && token.length > 1) tags.push(token.slice(1).toLowerCase());
        else terms.push(normalize(token));
    }
    return { tags, terms: terms.filter(Boolean) };
}

function snippet(text, term, radius = 60) {
    if (!text) return "";
    const plain = text.replace(/[#*_`>\[\]()]/g, "").replace(/\s+/g, " ");
    const index = normalize(plain).indexOf(term);
    if (index < 0) return plain.slice(0, radius * 2);
    const start = Math.max(0, index - radius);
    return `${start > 0 ? "…" : ""}${plain.slice(start, index + term.length + radius)}${index + term.length + radius < plain.length ? "…" : ""}`;
}

/**
 * @returns {{ item, score, snippet }[]} eng mos keluvchilar birinchi
 */
export function searchItems(items, query, { limit = 50, types = null } = {}) {
    const { tags, terms } = parseQuery(query);
    if (!tags.length && !terms.length) return [];

    const results = [];
    for (const item of items) {
        if (types && !types.includes(item.type)) continue;
        const itemTags = (item.tags ?? []).map((tag) => tag.toLowerCase());
        if (!tags.every((tag) => itemTags.includes(tag))) continue;

        const fields = fieldsOf(item);
        const normalized = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, normalize(value)]));

        let score = tags.length ? 2 : 0;
        let matchedAll = true;
        for (const term of terms) {
            let termScore = 0;
            for (const [key, value] of Object.entries(normalized)) {
                const index = value.indexOf(term);
                if (index === -1) continue;
                const wordStart = index === 0 || /\s/.test(value[index - 1]);
                termScore = Math.max(termScore, WEIGHTS[key] * (wordStart ? 1.5 : 1));
            }
            if (!termScore) {
                matchedAll = false;
                break;
            }
            score += termScore;
        }
        if (!matchedAll) continue;
        if (item.pinned) score += 1;

        results.push({
            item,
            score,
            snippet: terms.length && item.type !== "secret" ? snippet(fields.other, terms[0]) : "",
        });
    }

    return results
        .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
        .slice(0, limit);
}
