/**
 * Bosh sahifa: bugungi ishlar, tezkor yozish, statistika, maslahatlar va jarayondagi ishlar.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { MOODS, TYPES } from "../models/types.js";
import { reportError } from "../services/actions.js";
import { addDays, groupTasks, isDone, isOverdue, journalStreak, learningProgress, projectProgress, todayISO } from "../services/analytics.js";
import { generateInsights } from "../services/insights.js";
import { parseQuickInput } from "../services/quick-capture.js";
import { settings } from "../services/settings.js";
import { emptyState, progressBar, section } from "../ui/components.js";
import { h, icon, setChildren } from "../ui/dom.js";
import { formatLongDate, greeting } from "../ui/format.js";
import { itemCard, itemHref } from "../ui/item-card.js";
import { toast } from "../ui/toast.js";

const INSIGHT_ICON_TONE = { danger: "danger", warning: "warning", info: "primary", success: "success" };

export function insightCard(insight) {
    return h(
        "article",
        { class: `insight insight--${insight.tone}` },
        h("span", { class: `insight__icon tone-${INSIGHT_ICON_TONE[insight.tone]}` }, icon(insight.icon)),
        h(
            "div",
            { class: "insight__body" },
            h("h3", { class: "insight__title" }, insight.title),
            h("p", { class: "insight__text" }, insight.text),
            insight.action && h("a", { class: "insight__action", href: insight.action.href }, insight.action.label, " ", icon("fa-arrow-right"))
        )
    );
}

function quickCapture(navigate) {
    let type = "task";
    const input = h("input", {
        class: "quick__input",
        placeholder: t("quick.placeholder"),
        "aria-label": t("quick.label"),
        maxlength: 500,
    });
    const chips = ["task", "note", "link", "journal"].map((key) =>
        h(
            "button",
            {
                type: "button",
                class: ["chip", key === type && "is-active"],
                "aria-pressed": String(key === type),
                onClick: () => {
                    type = key;
                    chips.forEach((chip, i) => {
                        const active = ["task", "note", "link", "journal"][i] === key;
                        chip.classList.toggle("is-active", active);
                        chip.setAttribute("aria-pressed", String(active));
                    });
                    input.focus();
                },
            },
            icon(TYPES[key].icon),
            " ",
            TYPES[key].label
        )
    );

    const form = h(
        "form",
        {
            class: "quick",
            onSubmit: async (event) => {
                event.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                const parsed = parseQuickInput(text, { defaultType: type });
                if (parsed.type === "link" && !parsed.data.url) {
                    toast.warning(t("quick.linkNeedsUrl"));
                    return;
                }
                try {
                    const item = await store.create(parsed.type, parsed.data);
                    input.value = "";
                    toast.success(t(`types.${item.type}.added`), { action: { label: t("common.open"), onClick: () => navigate(itemHref(item)) } });
                } catch (error) {
                    reportError(error);
                }
            },
        },
        h("div", { class: "quick__row" }, icon("fa-bolt", "quick__icon"), input, h("button", { type: "submit", class: "btn btn--primary" }, t("common.add"))),
        h("div", { class: "quick__chips" }, chips, h("span", { class: "quick__hint" }, t("quick.hint")))
    );
    return { form, input };
}

function statTile({ iconName, label, value, hint, href, tone = "primary" }) {
    return h(
        "a",
        { class: "stat", href },
        h("span", { class: `stat__icon tone-${tone}` }, icon(iconName)),
        h("span", { class: "stat__text" }, h("span", { class: "stat__value" }, value), h("span", { class: "stat__label" }, label), hint && h("span", { class: "stat__hint" }, hint))
    );
}

export function dashboardView({ navigate }) {
    const root = h("div", { class: "dashboard" });
    const capture = quickCapture(navigate);

    const render = () => {
        const today = todayISO();
        const all = store.all();
        const tasks = store.byType("task");
        const openTasks = tasks.filter((t) => !isDone(t));
        const overdue = openTasks.filter((t) => isOverdue(t, today));
        const projects = store.byType("project").filter((p) => p.status === "active");
        const learning = store.byType("learning").filter((l) => l.status === "in_progress");
        const journal = store.byType("journal");
        const streak = journalStreak(journal, today);
        const todayEntry = journal.find((entry) => entry.date === today);
        const name = settings.get().displayName;

        const focusTasks = groupTasks(openTasks.filter((t) => t.dueDate && t.dueDate <= today), today).flatMap((g) => g.items);
        const upcoming = openTasks
            .filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .slice(0, 6);
        const pinned = all.filter((item) => item.pinned).slice(0, 8);
        const recent = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
        const insights = generateInsights(store.all({ includeTrashed: true }), { settings: settings.get() }).slice(0, 4);

        setChildren(root, 
            h(
                "header",
                { class: "dashboard__hero" },
                h("div", {}, h("p", { class: "dashboard__date" }, formatLongDate()), h("h1", { class: "dashboard__greeting" }, `${greeting()}${name ? `, ${name}` : ""}!`)),
                h(
                    "p",
                    { class: "dashboard__summary" },
                    focusTasks.length
                        ? overdue.length
                            ? t("dashboard.summaryOverdue", { count: focusTasks.length, overdue: overdue.length })
                            : t("dashboard.summary", { count: focusTasks.length })
                        : t("dashboard.summaryEmpty")
                )
            ),
            capture.form,
            h(
                "div",
                { class: "stats" },
                statTile({ iconName: "fa-list-check", label: t("dashboard.openTasks"), value: openTasks.length, hint: overdue.length ? t("dashboard.overdueCount", { count: overdue.length }) : t("dashboard.noOverdue"), href: "/tasks", tone: overdue.length ? "danger" : "primary" }),
                statTile({ iconName: "fa-diagram-project", label: t("dashboard.activeProjects"), value: projects.length, href: "/projects", tone: "info" }),
                statTile({ iconName: "fa-graduation-cap", label: t("dashboard.learning"), value: learning.length, href: "/learning", tone: "success" }),
                statTile({ iconName: "fa-fire", label: t("dashboard.streak"), value: t("common.days", { count: streak.current }), hint: t("dashboard.longest", { count: streak.longest }), href: "/journal", tone: "warning" })
            ),
            h(
                "div",
                { class: "dashboard__grid" },
                h(
                    "div",
                    { class: "dashboard__col" },
                    section({
                        title: t("dashboard.focus"),
                        iconName: "fa-crosshairs",
                        action: h("a", { class: "panel__link", href: "/tasks" }, t("common.all")),
                        children: focusTasks.length
                            ? h("div", { class: "card-list" }, focusTasks.slice(0, 10).map((t) => itemCard(t, { compact: true })))
                            : emptyState({ iconName: "fa-mug-hot", title: t("dashboard.focusEmpty"), text: t("dashboard.focusEmptyText") }),
                    }),
                    upcoming.length > 0 &&
                        section({
                            title: t("dashboard.upcoming"),
                            iconName: "fa-calendar-week",
                            children: h("div", { class: "card-list" }, upcoming.map((t) => itemCard(t, { compact: true }))),
                        }),
                    pinned.length > 0 &&
                        section({
                            title: t("dashboard.pinned"),
                            iconName: "fa-thumbtack",
                            children: h("div", { class: "card-list" }, pinned.map((item) => itemCard(item, { compact: true, showType: true }))),
                        }),
                    section({
                        title: t("dashboard.recent"),
                        iconName: "fa-clock-rotate-left",
                        children: recent.length
                            ? h("div", { class: "card-list" }, recent.map((item) => itemCard(item, { compact: true, showType: true })))
                            : emptyState({ iconName: "fa-seedling", title: t("dashboard.noItems"), text: t("dashboard.noItemsText") }),
                    })
                ),
                h(
                    "div",
                    { class: "dashboard__col" },
                    section({
                        title: t("dashboard.insights"),
                        iconName: "fa-lightbulb",
                        action: h("a", { class: "panel__link", href: "/advisor" }, t("common.more")),
                        children: insights.length
                            ? h("div", { class: "insight-list" }, insights.map(insightCard))
                            : h("p", { class: "text-muted" }, t("insight.none")),
                    }),
                    section({
                        title: t("types.journal.plural"),
                        iconName: "fa-book-open",
                        children: h(
                            "div",
                            { class: "journal-cta" },
                            todayEntry
                                ? h(
                                      "a",
                                      { class: "journal-cta__done", href: itemHref(todayEntry) },
                                      h("span", { class: "journal-cta__mood" }, MOODS.find((m) => m.value === todayEntry.mood)?.emoji ?? "📝"),
                                      h("span", {}, t("dashboard.journalDone"))
                                  )
                                : h("a", { class: "btn btn--ghost btn--block", href: "/journal/today" }, icon("fa-pen-nib"), ` ${t("dashboard.writeJournal")}`),
                            h(
                                "div",
                                { class: "week-moods", "aria-label": t("dashboard.weekMoods") },
                                Array.from({ length: 7 }, (_, i) => {
                                    const date = addDays(today, i - 6);
                                    const entry = journal.find((e) => e.date === date);
                                    const mood = MOODS.find((m) => m.value === entry?.mood);
                                    return h("span", { class: ["week-moods__day", entry && "has-entry"], title: date }, mood?.emoji ?? (entry ? "📝" : "·"));
                                })
                            )
                        ),
                    }),
                    projects.length > 0 &&
                        section({
                            title: t("dashboard.activeProjectsTitle"),
                            iconName: "fa-diagram-project",
                            action: h("a", { class: "panel__link", href: "/projects" }, t("common.all")),
                            children: h(
                                "div",
                                { class: "progress-list" },
                                projects.slice(0, 5).map((project) => {
                                    const { percent, done, total } = projectProgress(project, tasks);
                                    return h(
                                        "a",
                                        { class: "progress-item", href: itemHref(project) },
                                        h("span", { class: "progress-item__head" }, h("span", {}, project.title), h("span", { class: "text-muted" }, `${done}/${total} · ${percent}%`)),
                                        progressBar(percent, { label: project.title })
                                    );
                                })
                            ),
                        }),
                    learning.length > 0 &&
                        section({
                            title: t("dashboard.learningProgress"),
                            iconName: "fa-graduation-cap",
                            action: h("a", { class: "panel__link", href: "/learning" }, t("common.all")),
                            children: h(
                                "div",
                                { class: "progress-list" },
                                learning.slice(0, 5).map((course) => {
                                    const { percent, done, total } = learningProgress(course);
                                    return h(
                                        "a",
                                        { class: "progress-item", href: itemHref(course) },
                                        h("span", { class: "progress-item__head" }, h("span", {}, course.title), h("span", { class: "text-muted" }, total ? `${done}/${total}` : `${percent}%`)),
                                        progressBar(percent, { label: course.title, tone: "success" })
                                    );
                                })
                            ),
                        })
                )
            )
        );
    };

    render();
    const unsubscribe = store.subscribe(({ reason }) => {
        // Tezkor yozish maydonidagi matn yo'qolmasin
        const focused = document.activeElement === capture.input;
        render();
        if (focused && reason !== "clear") capture.input.focus();
    });
    return { title: t("nav.home"), el: root, cleanup: unsubscribe };
}
