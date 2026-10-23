/**
 * AI maslahatchi mijozi.
 *
 * Maxfiylik qoidalari:
 *  • Foydalanuvchi qaysi bo'limlarni yuborishni o'zi tanlaydi (sozlamalarda saqlanadi).
 *  • Maxfiy ma'lumotlar (parollar) HECH QACHON yuborilmaydi.
 *  • Yuboriladigan matnni yuborishdan oldin ko'rib chiqish mumkin (buildContext natijasi).
 */
import { api, apiHeaders, ApiError } from "../core/api.js";
import { t } from "../core/i18n.js";
import { LEARNING_STATUS, PRIORITY, PROJECT_STATUS, TASK_STATUS, displayTitle } from "../models/types.js";
import { isDone, journalStreak, learningProgress, projectProgress, todayISO } from "./analytics.js";

const MAX_CONTEXT = 50_000;

const clip = (text, max) => {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

/** Bo'lim nomlari — getter'lar, joriy tilda o'qiladi */
export const CONTEXT_SECTIONS = Object.freeze(
    Object.defineProperties(
        {},
        Object.fromEntries(["task", "project", "learning", "journal", "note", "link"].map((key) => [key, { enumerable: true, get: () => t(`ai.section.${key}`) }]))
    )
);

/** "[a, b, c]" — bo'sh qismlarsiz */
const bracket = (...parts) => `[${parts.filter(Boolean).join(", ")}]`;

export const getStatus = () => api.get("/ai/status");

/** Tanlangan bo'limlar bo'yicha ixcham matnli xulosa */
export function buildContext(items, include, today = todayISO()) {
    const alive = items.filter((item) => !item.trashedAt && item.type !== "secret");
    const of = (type) => alive.filter((item) => item.type === type);
    const tasks = of("task");
    const parts = [t("ai.ctx.today", { date: today }), t("ai.ctx.language")];

    if (include.task) {
        const open = tasks.filter((t) => !isDone(t)).slice(0, 60);
        const projectsById = new Map(of("project").map((p) => [p.id, p.title]));
        parts.push(
            `\n## ${t("ai.ctx.openTasks", { count: open.length })}`,
            ...open.map(
                (task) =>
                    `- ${displayTitle(task)} ${bracket(
                        TASK_STATUS[task.status],
                        PRIORITY[task.priority],
                        task.dueDate && t("ai.ctx.due", { date: task.dueDate }),
                        task.projectId && projectsById.has(task.projectId) && t("ai.ctx.project", { title: projectsById.get(task.projectId) })
                    )}`
            ),
            t("ai.ctx.doneLastWeek", { count: tasks.filter((task) => task.completedAt && new Date(task.completedAt) > Date.now() - 7 * 864e5).length })
        );
    }
    if (include.project) {
        parts.push(
            `\n## ${t("ai.section.project")}`,
            ...of("project").map((p) => {
                const { percent, total } = projectProgress(p, tasks);
                return `- ${displayTitle(p)} ${bracket(
                    PROJECT_STATUS[p.status],
                    `${percent}% (${t("ai.ctx.tasks", { count: total })})`,
                    p.deadline && t("ai.ctx.due", { date: p.deadline })
                )}${p.goal ? ` ${t("ai.ctx.goal", { goal: clip(p.goal, 200) })}` : ""}`;
            })
        );
    }
    if (include.learning) {
        parts.push(
            `\n## ${t("ai.ctx.learning")}`,
            ...of("learning").map((l) => {
                const { percent, done, total } = learningProgress(l);
                return `- ${displayTitle(l)} ${bracket(
                    LEARNING_STATUS[l.status],
                    `${percent}% (${t("ai.ctx.milestones", { done, total })})`,
                    l.targetDate && t("ai.ctx.target", { date: l.targetDate }),
                    l.hoursSpent && t("ai.ctx.hours", { count: l.hoursSpent })
                )}`;
            })
        );
    }
    if (include.journal) {
        const entries = of("journal").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
        const { current } = journalStreak(entries, today);
        parts.push(
            `\n## ${t("ai.ctx.journal", { count: current })}`,
            ...entries.slice(0, 7).map((e) => `- ${e.date}${e.mood ? ` (${t("ai.ctx.mood", { mood: e.mood })})` : ""}: ${clip(e.body, 400)}`)
        );
    }
    if (include.note) {
        parts.push(`\n## ${t("ai.section.note")}`, ...of("note").slice(0, 30).map((n) => `- ${displayTitle(n)}: ${clip(n.body, 200)}`));
    }
    if (include.link) {
        parts.push(`\n## ${t("ai.section.link")}`, ...of("link").slice(0, 30).map((l) => `- ${displayTitle(l)} (${l.read ? t("ai.ctx.read") : t("ai.ctx.unread")})`));
    }

    const text = parts.join("\n");
    return text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}\n…` : text;
}

/**
 * Javobni oqim ko'rinishida oladi (Server-Sent Events).
 * @returns {Promise<{ stopReason: string|null, refused: boolean }>}
 */
export async function streamChat({ messages, context }, { onText, signal }) {
    const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify({ messages, context }),
        signal,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(response.status, data.error?.code ?? "AI_ERROR", data.error?.message ?? t("ai.requestFailed"));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = { stopReason: null, refused: false };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const line = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 2);
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5));
            if (event.type === "text") onText(event.text);
            else if (event.type === "refusal") {
                result.refused = true;
                onText(`\n\n_${event.message}_`);
            } else if (event.type === "done") result.stopReason = event.stopReason;
            else if (event.type === "error") throw new Error(event.message);
        }
    }
    return result;
}
