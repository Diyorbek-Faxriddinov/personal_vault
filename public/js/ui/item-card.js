/**
 * Yozuvning ro'yxatdagi ko'rinishi (kartochka). Turiga qarab turlicha ma'lumot ko'rsatadi.
 * Bosh sahifa, ro'yxatlar, qidiruv, teglar va savatda bir xil komponent ishlatiladi.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { displayTitle, hostname, LEARNING_KIND, LEARNING_STATUS, MOODS, PRIORITY, PROJECT_STATUS, safeUrl, TASK_STATUS, TYPES } from "../models/types.js";
import { checklistProgress, learningProgress, projectProgress } from "../services/analytics.js";
import { toggleRead, toggleTask } from "../services/actions.js";
import { badge, progressBar, tagList } from "./components.js";
import { copyToClipboard, h, icon } from "./dom.js";
import { dueLabel, formatDate, monthShort, relativeTime } from "./format.js";
import { plainExcerpt } from "./markdown.js";
import { toast } from "./toast.js";

const STATUS_TONE = {
    active: "primary",
    in_progress: "primary",
    done: "success",
    completed: "success",
    paused: "muted",
    idea: "info",
    planned: "info",
};

export const itemHref = (item) => `/${TYPES[item.type].route}/${item.id}`;

function metaRow(...parts) {
    const items = parts.flat().filter(Boolean);
    return items.length ? h("div", { class: "card__meta" }, items) : null;
}

const copyButton = (label, value, iconName) =>
    value &&
    h(
        "button",
        {
            type: "button",
            class: "icon-btn icon-btn--ghost icon-btn--sm",
            title: label,
            "aria-label": label,
            onClick: async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (await copyToClipboard(value)) toast.success(t("common.copiedLabel", { label }));
            },
        },
        icon(iconName)
    );

const RENDERERS = {
    task(item) {
        const due = dueLabel(item.dueDate);
        const project = item.projectId ? store.get(item.projectId) : null;
        const sub = checklistProgress(item.subtasks);
        return {
            leading: h("input", {
                type: "checkbox",
                class: "checkbox__input checkbox__input--round",
                checked: item.status === "done",
                "aria-label": item.status === "done" ? t("task.markUndone") : t("task.markDone"),
                onClick: (event) => event.stopPropagation(),
                onChange: () => toggleTask(item),
            }),
            meta: metaRow(
                due && badge(due.text, { tone: due.tone, iconName: "fa-calendar-day" }),
                ["high", "urgent"].includes(item.priority) && badge(PRIORITY[item.priority], { tone: item.priority === "urgent" ? "danger" : "warning", iconName: "fa-flag" }),
                item.status === "doing" && badge(TASK_STATUS.doing, { tone: "primary", iconName: "fa-spinner" }),
                item.recurrence && item.recurrence !== "none" && badge("", { iconName: "fa-repeat" }),
                project && h("span", { class: "card__project" }, icon("fa-diagram-project"), project.title),
                sub.total > 0 && h("span", {}, icon("fa-list-check"), ` ${sub.done}/${sub.total}`)
            ),
        };
    },

    project(item) {
        const progress = projectProgress(item, store.byType("task"));
        return {
            meta: metaRow(
                badge(PROJECT_STATUS[item.status], { tone: STATUS_TONE[item.status] }),
                item.deadline && h("span", {}, icon("fa-flag-checkered"), ` ${formatDate(item.deadline)}`),
                h("span", {}, icon("fa-list-check"), ` ${t("card.tasksProgress", { done: progress.done, total: progress.total })}`)
            ),
            extra: h("div", { class: "card__progress" }, progressBar(progress.percent, { label: t("card.projectProgress") }), h("span", {}, `${progress.percent}%`)),
            excerpt: item.goal,
        };
    },

    learning(item) {
        const progress = learningProgress(item);
        return {
            meta: metaRow(
                badge(LEARNING_KIND[item.kind] ?? "", { tone: "info" }),
                badge(LEARNING_STATUS[item.status], { tone: STATUS_TONE[item.status] }),
                item.targetDate && h("span", {}, icon("fa-bullseye"), ` ${formatDate(item.targetDate)}`),
                item.hoursSpent > 0 && h("span", {}, icon("fa-clock"), ` ${t("card.hours", { count: item.hoursSpent })}`)
            ),
            extra:
                progress.total > 0 || item.status === "completed"
                    ? h("div", { class: "card__progress" }, progressBar(progress.percent, { label: t("card.learningProgress"), tone: "success" }), h("span", {}, `${progress.done}/${progress.total}`))
                    : null,
        };
    },

    link(item) {
        return {
            leading: h("span", { class: "card__favicon", "aria-hidden": "true" }, hostname(item.url).charAt(0).toUpperCase() || "?"),
            meta: metaRow(
                h("span", { class: "card__host" }, hostname(item.url)),
                item.collection && badge(item.collection, { iconName: "fa-folder" }),
                !item.read && badge(t("link.unread"), { tone: "primary" })
            ),
            excerpt: item.description,
            trailing: [
                h(
                    "button",
                    {
                        type: "button",
                        class: "icon-btn icon-btn--ghost icon-btn--sm",
                        title: item.read ? t("link.markUnread") : t("link.markRead"),
                        "aria-label": item.read ? t("link.markUnread") : t("link.markRead"),
                        onClick: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleRead(item);
                        },
                    },
                    icon(item.read ? "fa-envelope-open" : "fa-envelope")
                ),
                safeUrl(item.url) &&
                h(
                    "a",
                    {
                        class: "icon-btn icon-btn--ghost icon-btn--sm",
                        href: safeUrl(item.url),
                        target: "_blank",
                        rel: "noopener noreferrer",
                        "data-external": "",
                        title: t("common.open"),
                        "aria-label": t("common.openNewTab"),
                        onClick: (event) => event.stopPropagation(),
                    },
                    icon("fa-arrow-up-right-from-square")
                ),
            ],
        };
    },

    note(item) {
        return { meta: metaRow(h("span", {}, relativeTime(item.updatedAt))) };
    },

    journal(item) {
        const date = item.date ? new Date(`${item.date}T00:00:00`) : null;
        const mood = MOODS.find((m) => m.value === item.mood);
        return {
            leading: date && h("span", { class: "card__date" }, h("strong", {}, date.getDate()), h("span", {}, monthShort(date.getMonth()))),
            meta: metaRow(mood && h("span", { class: "card__mood", title: mood.label }, mood.emoji)),
            title: item.title?.trim() || formatDate(item.date, { withYear: true }),
        };
    },

    secret(item) {
        return {
            leading: h("span", { class: "card__favicon card__favicon--secret", "aria-hidden": "true" }, icon("fa-lock")),
            meta: metaRow(item.username && h("span", {}, item.username), item.url && h("span", { class: "card__host" }, hostname(item.url))),
            excerpt: null,
            trailing: [copyButton(t("field.username"), item.username, "fa-user"), copyButton(t("field.password"), item.password, "fa-key")],
        };
    },
};

/**
 * @param {object} item
 * @param {{ showType?: boolean, compact?: boolean, trailing?: Node[], href?: string|null }} options
 */
export function itemCard(item, { showType = false, compact = false, trailing = [], href } = {}) {
    const type = TYPES[item.type];
    const view = RENDERERS[item.type](item);
    const excerptText = view.excerpt !== undefined ? view.excerpt : item.type === "secret" ? null : plainExcerpt(item.body, compact ? 90 : 160);
    const link = href === null ? null : href ?? itemHref(item);

    const title = h(
        link ? "a" : "span",
        { class: "card__title", href: link ?? undefined },
        showType && h("span", { class: `type-dot type-dot--${item.type}`, title: type.label }, icon(type.icon)),
        h("span", { class: ["card__title-text", item.type === "task" && item.status === "done" && "is-done"] }, view.title ?? displayTitle(item)),
        item.pinned && icon("fa-thumbtack", "card__pin"),
        item.favorite && icon("fa-star", "card__fav")
    );

    return h(
        "article",
        { class: ["card", `card--${item.type}`, compact && "card--compact"], dataset: { id: item.id } },
        view.leading && h("div", { class: "card__leading" }, view.leading),
        h(
            "div",
            { class: "card__main" },
            title,
            !compact && excerptText && h("p", { class: "card__excerpt" }, excerptText),
            view.meta,
            !compact && view.extra,
            !compact && tagList(item.tags)
        ),
        [...(view.trailing ?? []), ...trailing].filter(Boolean).length
            ? h("div", { class: "card__trailing" }, [...(view.trailing ?? []), ...trailing].filter(Boolean))
            : null
    );
}
