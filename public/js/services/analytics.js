/**
 * Hisob-kitoblar: muddatlar, progress, kundalik ketma-ketligi (streak) va h.k.
 * Sof funksiyalar — DOM'ga bog'liq emas, testlarda tekshiriladi.
 * Sanalar "YYYY-MM-DD" ko'rinishida, mahalliy vaqt bo'yicha.
 */
import { t } from "../core/i18n.js";

export function todayISO(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const parseISO = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
};

export function addDays(iso, days) {
    const date = parseISO(iso);
    date.setDate(date.getDate() + days);
    return todayISO(date);
}

export function addMonths(iso, months) {
    const date = parseISO(iso);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return todayISO(date);
}

/** b - a, kunlarda */
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86_400_000);

export const daysSince = (isoDateTime, now = new Date()) => (now - new Date(isoDateTime)) / 86_400_000;

// ─── Vazifalar ────────────────────────────────────────────────────

export const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

export const isDone = (task) => task.status === "done";

export const isOverdue = (task, today = todayISO()) => !isDone(task) && Boolean(task.dueDate) && task.dueDate < today;

export function taskBucket(task, today = todayISO()) {
    if (isDone(task)) return "done";
    if (!task.dueDate) return "nodate";
    const diff = daysBetween(today, task.dueDate);
    if (diff < 0) return "overdue";
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff <= 7) return "week";
    return "later";
}

/** label — getter: guruhlash paytidagi tilda o'qiladi */
export const TASK_BUCKETS = [
    { key: "overdue", tone: "danger" },
    { key: "today", tone: "primary" },
    { key: "tomorrow" },
    { key: "week" },
    { key: "later" },
    { key: "nodate" },
    { key: "done", collapsed: true },
].map((bucket) => Object.defineProperty(bucket, "label", { enumerable: true, get: () => t(`bucket.${bucket.key}`) }));

export function compareTasks(a, b) {
    if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
    }
    return (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0) || a.createdAt.localeCompare(b.createdAt);
}

export function groupTasks(tasks, today = todayISO()) {
    const groups = new Map(TASK_BUCKETS.map((bucket) => [bucket.key, { ...bucket, items: [] }]));
    for (const task of tasks) groups.get(taskBucket(task, today)).items.push(task);
    for (const group of groups.values()) {
        group.items.sort(group.key === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : compareTasks);
    }
    return [...groups.values()].filter((group) => group.items.length);
}

/** Takrorlanuvchi vazifaning keyingi muddati (bugundan oldinga) */
export function nextOccurrence(dueDate, recurrence, today = todayISO()) {
    if (!recurrence || recurrence === "none") return null;
    const anchor = dueDate || today;
    // Har doim asl sanadan hisoblaymiz: 31-avgust → 30-sentabr → 31-oktabr (sana "siljimaydi")
    const shift = (n) =>
        recurrence === "daily" ? addDays(anchor, n) : recurrence === "weekly" ? addDays(anchor, 7 * n) : addMonths(anchor, n);
    let n = 1;
    while (shift(n) <= today) n++;
    return shift(n);
}

// ─── Progress ─────────────────────────────────────────────────────

export function checklistProgress(list = []) {
    const total = list.length;
    const done = list.filter((entry) => entry.done).length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function projectProgress(project, allTasks) {
    const tasks = allTasks.filter((task) => task.projectId === project.id);
    const done = tasks.filter(isDone).length;
    const percent = project.status === "done" ? 100 : tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    return { done, total: tasks.length, percent, tasks };
}

export function learningProgress(item) {
    if (item.status === "completed") return { ...checklistProgress(item.milestones), percent: 100 };
    return checklistProgress(item.milestones);
}

/** Loyihaning oxirgi faollik vaqti: o'zi yoki vazifalaridan eng so'nggi o'zgarish */
export function projectLastActivity(project, allTasks) {
    return allTasks
        .filter((task) => task.projectId === project.id)
        .reduce((latest, task) => (task.updatedAt > latest ? task.updatedAt : latest), project.updatedAt);
}

// ─── Kundalik ─────────────────────────────────────────────────────

export function journalStreak(entries, today = todayISO()) {
    const dates = new Set(entries.map((entry) => entry.date).filter(Boolean));
    const hasToday = dates.has(today);

    let current = 0;
    let day = hasToday ? today : addDays(today, -1);
    while (dates.has(day)) {
        current++;
        day = addDays(day, -1);
    }

    let longest = 0;
    let run = 0;
    let previous = null;
    for (const date of [...dates].sort()) {
        run = previous && addDays(previous, 1) === date ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = date;
    }
    return { current, longest, hasToday, total: dates.size };
}

export function moodAverage(entries, days, today = todayISO()) {
    const from = addDays(today, -(days - 1));
    const moods = entries.filter((e) => e.date >= from && e.date <= today && e.mood).map((e) => e.mood);
    return moods.length ? { average: moods.reduce((a, b) => a + b, 0) / moods.length, count: moods.length } : null;
}

/** Oxirgi N kunda bajarilgan vazifalar soni */
export function completedSince(tasks, days, now = new Date()) {
    const since = now.getTime() - days * 86_400_000;
    return tasks.filter((task) => task.completedAt && new Date(task.completedAt).getTime() >= since).length;
}
