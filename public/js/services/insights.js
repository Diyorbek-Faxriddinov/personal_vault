/**
 * Maslahatlar — qoidalarga asoslangan, butunlay brauzerda hisoblanadi (ma'lumot hech qayerga ketmaydi).
 * Har bir qoida yozuvlarga qarab foydali tavsiya beradi: kechikkan ishlar, unutilgan loyihalar,
 * to'xtab qolgan o'qish, kundalik odati, zaif parollar, zaxira nusxa eslatmasi va h.k.
 *
 * Natija: { id, tone: "danger"|"warning"|"info"|"success", icon, title, text, action?: { label, href } }[]
 */
import { passwordStrength } from "../ui/password-tools.js";
import {
    completedSince,
    daysBetween,
    daysSince,
    isDone,
    isOverdue,
    journalStreak,
    learningProgress,
    moodAverage,
    projectLastActivity,
    todayISO,
} from "./analytics.js";
import { t } from "../core/i18n.js";

const TONE_ORDER = { danger: 0, warning: 1, info: 2, success: 3 };

export function generateInsights(items, { now = new Date(), settings = {} } = {}) {
    const today = todayISO(now);
    const alive = items.filter((item) => !item.trashedAt);
    const byType = (type) => alive.filter((item) => item.type === type);

    const tasks = byType("task");
    const projects = byType("project");
    const learning = byType("learning");
    const journal = byType("journal");
    const links = byType("link");
    const secrets = byType("secret");
    const notes = byType("note");
    const insights = [];
    const add = (insight) => insights.push(insight);

    // ── Boshlash ──
    if (!alive.length) {
        add({
            id: "welcome",
            tone: "info",
            icon: "fa-wand-magic-sparkles",
            title: t("insight.welcome.title"),
            text: t("insight.welcome.text"),
            action: { label: t("insight.addTask"), href: "/tasks/new" },
        });
        return insights;
    }

    // ── Vazifalar ──
    const overdue = tasks.filter((task) => isOverdue(task, today));
    if (overdue.length) {
        add({
            id: "tasks-overdue",
            tone: "danger",
            icon: "fa-clock",
            title: t("insight.overdue.title", { count: overdue.length }),
            text: t("insight.overdue.text"),
            action: { label: t("insight.review"), href: "/tasks" },
        });
    }

    const dueToday = tasks.filter((task) => !isDone(task) && task.dueDate === today);
    if (dueToday.length > 7) {
        add({
            id: "tasks-too-many-today",
            tone: "warning",
            icon: "fa-scale-unbalanced",
            title: t("insight.tooMany.title", { count: dueToday.length }),
            text: t("insight.tooMany.text"),
            action: { label: t("insight.viewPlan"), href: "/tasks" },
        });
    }

    const urgentNoDate = tasks.filter((task) => !isDone(task) && ["urgent", "high"].includes(task.priority) && !task.dueDate);
    if (urgentNoDate.length) {
        add({
            id: "tasks-urgent-nodate",
            tone: "warning",
            icon: "fa-flag",
            title: t("insight.urgentNoDate.title", { count: urgentNoDate.length }),
            text: t("insight.urgentNoDate.text"),
            action: { label: t("insight.setDueDate"), href: `/tasks/${urgentNoDate[0].id}` },
        });
    }

    const doneThisWeek = completedSince(tasks, 7, now);
    if (doneThisWeek >= 5) {
        add({
            id: "tasks-productive-week",
            tone: "success",
            icon: "fa-trophy",
            title: t("insight.productive.title", { count: doneThisWeek }),
            text: t("insight.productive.text"),
        });
    }

    // ── Loyihalar ──
    for (const project of projects.filter((p) => p.status === "active")) {
        const projectTasks = tasks.filter((task) => task.projectId === project.id);
        const openTasks = projectTasks.filter((task) => !isDone(task));
        const idleDays = Math.floor(daysSince(projectLastActivity(project, tasks), now));

        if (project.deadline && project.deadline < today) {
            add({
                id: `project-deadline-${project.id}`,
                tone: "danger",
                icon: "fa-hourglass-end",
                title: t("insight.projectDeadline.title", { title: project.title }),
                text: t("insight.projectDeadline.text"),
                action: { label: t("insight.openProject"), href: `/projects/${project.id}` },
            });
        } else if (!openTasks.length) {
            add({
                id: `project-no-next-step-${project.id}`,
                tone: "info",
                icon: "fa-shoe-prints",
                title: t("insight.projectNoNextStep.title", { title: project.title }),
                text: t("insight.projectNoNextStep.text"),
                action: { label: t("insight.addTask"), href: `/tasks/new?project=${project.id}` },
            });
        } else if (idleDays >= 14) {
            add({
                id: `project-idle-${project.id}`,
                tone: "warning",
                icon: "fa-bed",
                title: t("insight.projectIdle.title", { title: project.title, count: idleDays }),
                text: t("insight.projectIdle.text", { status: t("projectStatus.paused") }),
                action: { label: t("insight.openProject"), href: `/projects/${project.id}` },
            });
        }
    }

    // ── O'qish ──
    for (const course of learning.filter((l) => l.status === "in_progress")) {
        const idleDays = Math.floor(daysSince(course.updatedAt, now));
        const { percent } = learningProgress(course);
        if (course.targetDate && course.targetDate < today) {
            add({
                id: `learning-late-${course.id}`,
                tone: "warning",
                icon: "fa-graduation-cap",
                title: t("insight.learningLate.title", { title: course.title, percent }),
                text: t("insight.learningLate.text"),
                action: { label: t("insight.openPlan"), href: `/learning/${course.id}` },
            });
        } else if (idleDays >= 7) {
            add({
                id: `learning-idle-${course.id}`,
                tone: "info",
                icon: "fa-book",
                title: t("insight.learningIdle.title", { title: course.title, count: idleDays }),
                text: t("insight.learningIdle.text"),
                action: { label: t("insight.continue"), href: `/learning/${course.id}` },
            });
        }
    }
    if (learning.length && !learning.some((l) => l.status === "in_progress") && learning.some((l) => l.status === "planned")) {
        add({
            id: "learning-start",
            tone: "info",
            icon: "fa-play",
            title: t("insight.learningStart.title"),
            text: t("insight.learningStart.text"),
            action: { label: t("insight.viewList"), href: "/learning" },
        });
    }

    // ── Kundalik ──
    const streak = journalStreak(journal, today);
    if (streak.current >= 3) {
        add({
            id: "journal-streak",
            tone: "success",
            icon: "fa-fire",
            title: t("insight.streak.title", { count: streak.current }),
            text: streak.hasToday ? t("insight.streak.textDone") : t("insight.streak.textPending"),
            action: streak.hasToday ? undefined : { label: t("insight.todayEntry"), href: "/journal/today" },
        });
    } else if (journal.length && !streak.hasToday) {
        add({
            id: "journal-today",
            tone: "info",
            icon: "fa-pen-nib",
            title: t("insight.journalToday.title"),
            text: t("insight.journalToday.text"),
            action: { label: t("insight.write"), href: "/journal/today" },
        });
    }
    const mood = moodAverage(journal, 7, today);
    if (mood && mood.count >= 3 && mood.average <= 2.2) {
        add({
            id: "journal-mood-low",
            tone: "warning",
            icon: "fa-heart",
            title: t("insight.moodLow.title"),
            text: t("insight.moodLow.text"),
        });
    }

    // ── Havolalar ──
    const unread = links.filter((link) => !link.read);
    if (unread.length >= 15) {
        add({
            id: "links-backlog",
            tone: "info",
            icon: "fa-inbox",
            title: t("insight.linksBacklog.title", { count: unread.length }),
            text: t("insight.linksBacklog.text"),
            action: { label: t("types.link.plural"), href: "/links" },
        });
    }

    // ── Xavfsizlik ──
    const weak = secrets.filter((secret) => secret.password && passwordStrength(secret.password).score < 2);
    if (weak.length) {
        add({
            id: "secrets-weak",
            tone: "danger",
            icon: "fa-shield-halved",
            title: t("insight.weak.title", { count: weak.length }),
            text: t("insight.weak.text", { title: weak[0].title }),
            action: { label: t("insight.fix"), href: `/secrets/${weak[0].id}` },
        });
    }
    const passwordCounts = new Map();
    for (const secret of secrets.filter((s) => s.password)) {
        passwordCounts.set(secret.password, (passwordCounts.get(secret.password) ?? 0) + 1);
    }
    const reused = [...passwordCounts.values()].filter((count) => count > 1).reduce((a, b) => a + b, 0);
    if (reused) {
        add({
            id: "secrets-reused",
            tone: "warning",
            icon: "fa-clone",
            title: t("insight.reused.title", { count: reused }),
            text: t("insight.reused.text"),
            action: { label: t("types.secret.plural"), href: "/secrets" },
        });
    }

    // ── Tartib ──
    const untagged = notes.filter((note) => !note.tags?.length);
    if (untagged.length >= 10) {
        add({
            id: "notes-untagged",
            tone: "info",
            icon: "fa-tags",
            title: t("insight.untagged.title", { count: untagged.length }),
            text: t("insight.untagged.text"),
            action: { label: t("types.note.plural"), href: "/notes" },
        });
    }

    const oldTrash = items.filter((item) => item.trashedAt && daysSince(item.trashedAt, now) > 30);
    if (oldTrash.length) {
        add({
            id: "trash-old",
            tone: "info",
            icon: "fa-trash-can",
            title: t("insight.oldTrash.title", { count: oldTrash.length }),
            text: t("insight.oldTrash.text"),
            action: { label: t("nav.trash"), href: "/trash" },
        });
    }

    const lastBackup = settings.lastBackupAt;
    if (alive.length >= 10 && (!lastBackup || daysBetween(todayISO(new Date(lastBackup)), today) > 30)) {
        add({
            id: "backup",
            tone: "warning",
            icon: "fa-floppy-disk",
            title: lastBackup ? t("insight.backup.old") : t("insight.backup.never"),
            text: t("insight.backup.text"),
            action: { label: t("settings.backup.title"), href: "/settings#backup" },
        });
    }

    return insights.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
