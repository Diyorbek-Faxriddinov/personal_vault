/**
 * Yozuv sahifasi: ko'rish rejimi va tahrirlash rejimi (yangi yozuv — darhol tahrirlash).
 * Forma models/types.js dagi maydonlar ta'rifidan avtomatik quriladi.
 */
import { t } from "../core/i18n.js";
import { ConflictError, store } from "../core/store.js";
import {
    displayTitle,
    hostname,
    LEARNING_KIND,
    LEARNING_STATUS,
    MOODS,
    PRIORITY,
    PROJECT_STATUS,
    RECURRENCE,
    safeUrl,
    TASK_STATUS,
    TYPES,
    typeByRoute,
} from "../models/types.js";
import { duplicateItem, reportError, restoreItem, toggleChecklistEntry, toggleFavorite, togglePin, trashItem } from "../services/actions.js";
import { checklistProgress, learningProgress, projectProgress, todayISO } from "../services/analytics.js";
import { badge, emptyState, progressBar, tagList } from "../ui/components.js";
import { confirmDialog } from "../ui/dialog.js";
import { copyToClipboard, h, icon, setChildren } from "../ui/dom.js";
import { createField } from "../ui/fields.js";
import { dueLabel, formatDate, formatDateTime, relativeTime } from "../ui/format.js";
import { itemCard, itemHref } from "../ui/item-card.js";
import { renderMarkdown } from "../ui/markdown.js";
import { toast } from "../ui/toast.js";

/** /journal/today — bugungi yozuvni ochadi yoki yangisini boshlaydi */
export function journalTodayView({ navigate }) {
    const today = todayISO();
    const entry = store.byType("journal").find((e) => e.date === today);
    navigate(entry ? itemHref(entry) : `/journal/new?date=${today}`, { replace: true, force: true });
    return { title: t("types.journal.plural"), el: h("div") };
}

// ─── Ko'rish rejimi ───────────────────────────────────────────────

function metaItem(label, value) {
    return value === null || value === undefined || value === "" || value === false ? null : h("div", { class: "meta__item" }, h("dt", {}, label), h("dd", {}, value));
}

function secretValue(value, label) {
    if (!value) return null;
    let shown = false;
    const text = h("code", { class: "secret-value__text" }, "••••••••••••");
    const toggle = h(
        "button",
        {
            type: "button",
            class: "icon-btn icon-btn--ghost icon-btn--sm",
            "aria-label": t("password.show"),
            onClick: () => {
                shown = !shown;
                text.textContent = shown ? value : "••••••••••••";
                toggle.replaceChildren(icon(shown ? "fa-eye-slash" : "fa-eye"));
            },
        },
        icon("fa-eye")
    );
    return h(
        "span",
        { class: "secret-value" },
        text,
        toggle,
        h(
            "button",
            {
                type: "button",
                class: "icon-btn icon-btn--ghost icon-btn--sm",
                "aria-label": t("common.copyLabel", { label }),
                onClick: async () => {
                    if (await copyToClipboard(value)) toast.success(t("common.copiedLabel", { label }));
                },
            },
            icon("fa-copy")
        )
    );
}

function interactiveChecklist(item, key, title) {
    const entries = item[key] ?? [];
    if (!entries.length) return null;
    const { done, total, percent } = checklistProgress(entries);
    return h(
        "section",
        { class: "detail__section" },
        h("h2", { class: "detail__heading" }, title, h("span", { class: "text-muted" }, ` ${done}/${total}`)),
        progressBar(percent, { label: title, tone: "success" }),
        h(
            "ul",
            { class: "checklist checklist--view" },
            entries.map((entry) =>
                h(
                    "li",
                    { class: ["checklist__item", entry.done && "is-done"] },
                    h(
                        "label",
                        { class: "checkbox" },
                        h("input", { type: "checkbox", class: "checkbox__input", checked: entry.done, onChange: () => toggleChecklistEntry(store.get(item.id), key, entry.id) }),
                        h("span", {}, entry.text)
                    )
                )
            )
        )
    );
}

function typeDetails(item) {
    switch (item.type) {
        case "task": {
            const due = dueLabel(item.dueDate);
            const project = item.projectId ? store.get(item.projectId) : null;
            return {
                meta: [
                    metaItem(t("field.status"), badge(TASK_STATUS[item.status], { tone: item.status === "done" ? "success" : item.status === "doing" ? "primary" : "muted" })),
                    metaItem(t("field.priority"), PRIORITY[item.priority]),
                    metaItem(t("field.dueDate"), item.dueDate && h("span", {}, formatDate(item.dueDate, { withYear: true }), " ", due && badge(due.text, { tone: due.tone }))),
                    item.recurrence !== "none" && metaItem(t("field.recurrence"), RECURRENCE[item.recurrence]),
                    metaItem(t("types.project.label"), project && h("a", { href: itemHref(project) }, project.title)),
                    metaItem(t("item.completedAt"), item.status === "done" && formatDateTime(item.completedAt)),
                ],
                sections: [interactiveChecklist(item, "subtasks", t("field.subtasks"))],
            };
        }
        case "project": {
            const progress = projectProgress(item, store.byType("task"));
            const open = progress.tasks.filter((t) => t.status !== "done");
            const done = progress.tasks.filter((t) => t.status === "done");
            return {
                meta: [
                    metaItem(t("field.status"), badge(PROJECT_STATUS[item.status], { tone: item.status === "active" ? "primary" : item.status === "done" ? "success" : "muted" })),
                    metaItem(t("field.deadline"), item.deadline && formatDate(item.deadline, { withYear: true })),
                    metaItem(t("item.link"), safeUrl(item.url) && h("a", { href: safeUrl(item.url), target: "_blank", rel: "noopener noreferrer", "data-external": "" }, hostname(item.url), " ", icon("fa-arrow-up-right-from-square"))),
                    metaItem(t("common.progress"), `${progress.percent}% (${progress.done}/${progress.total})`),
                ],
                lead: item.goal && h("blockquote", { class: "detail__goal" }, icon("fa-bullseye"), " ", item.goal),
                sections: [
                    h(
                        "section",
                        { class: "detail__section" },
                        h(
                            "div",
                            { class: "detail__heading-row" },
                            h("h2", { class: "detail__heading" }, t("types.task.plural")),
                            h("a", { class: "btn btn--ghost btn--sm", href: `/tasks/new?project=${item.id}` }, icon("fa-plus"), ` ${t("types.task.add")}`)
                        ),
                        progressBar(progress.percent, { label: t("card.projectProgress") }),
                        open.length
                            ? h("div", { class: "card-list" }, open.map((task) => itemCard(task, { compact: true })))
                            : h("p", { class: "text-muted" }, t("item.noOpenTasks")),
                        done.length > 0 &&
                            h("details", { class: "task-group--done" }, h("summary", {}, `${t("bucket.done")} (${done.length})`), h("div", { class: "card-list" }, done.map((task) => itemCard(task, { compact: true }))))
                    ),
                ],
            };
        }
        case "learning": {
            const progress = learningProgress(item);
            return {
                meta: [
                    metaItem(t("field.kind"), LEARNING_KIND[item.kind]),
                    metaItem(t("field.status"), badge(LEARNING_STATUS[item.status], { tone: item.status === "in_progress" ? "primary" : item.status === "completed" ? "success" : "muted" })),
                    metaItem(t("field.targetDate"), item.targetDate && formatDate(item.targetDate, { withYear: true })),
                    metaItem(
                        t("item.timeSpent"),
                        h(
                            "span",
                            { class: "cluster cluster--tight" },
                            t("card.hours", { count: item.hoursSpent || 0 }),
                            h(
                                "button",
                                {
                                    type: "button",
                                    class: "btn btn--ghost btn--xs",
                                    title: t("item.add30Title"),
                                    onClick: () =>
                                        store
                                            .update(item.id, { hoursSpent: Math.round(((item.hoursSpent || 0) + 0.5) * 10) / 10, status: item.status === "planned" ? "in_progress" : item.status })
                                            .then(() => toast.success(t("item.add30Done")))
                                            .catch(reportError),
                                },
                                t("item.add30")
                            )
                        )
                    ),
                    metaItem(t("item.source"), safeUrl(item.url) && h("a", { href: safeUrl(item.url), target: "_blank", rel: "noopener noreferrer", "data-external": "" }, hostname(item.url), " ", icon("fa-arrow-up-right-from-square"))),
                    metaItem(t("common.progress"), `${progress.percent}%`),
                ],
                sections: [interactiveChecklist(item, "milestones", t("item.milestones"))],
            };
        }
        case "link":
            return {
                meta: [
                    metaItem(t("item.address"), safeUrl(item.url) && h("a", { href: safeUrl(item.url), target: "_blank", rel: "noopener noreferrer", "data-external": "", class: "break" }, item.url)),
                    metaItem(t("field.collection"), item.collection),
                    metaItem(t("field.status"), item.read ? t("link.read") : t("link.unread")),
                ],
                lead: item.description && h("p", { class: "detail__lead" }, item.description),
            };
        case "journal": {
            const mood = MOODS.find((m) => m.value === item.mood);
            return {
                meta: [metaItem(t("field.date"), formatDate(item.date, { withYear: true })), metaItem(t("field.mood"), mood && `${mood.emoji} ${mood.label}`)],
                after: item.gratitude && h("section", { class: "detail__section" }, h("h2", { class: "detail__heading" }, `🙏 ${t("field.gratitude")}`), h("p", {}, item.gratitude)),
            };
        }
        case "secret":
            return {
                meta: [
                    metaItem(t("field.username"), item.username && h("span", { class: "secret-value" }, h("code", {}, item.username), h("button", { type: "button", class: "icon-btn icon-btn--ghost icon-btn--sm", "aria-label": t("common.copyLabel", { label: t("field.username") }), onClick: async () => (await copyToClipboard(item.username)) && toast.success(t("common.copiedLabel", { label: t("field.username") })) }, icon("fa-copy")))),
                    metaItem(t("field.password"), secretValue(item.password, t("field.password"))),
                    metaItem(t("item.site"), safeUrl(item.url) && h("a", { href: safeUrl(item.url), target: "_blank", rel: "noopener noreferrer", "data-external": "" }, hostname(item.url), " ", icon("fa-arrow-up-right-from-square"))),
                ],
            };
        default:
            return { meta: [] };
    }
}

function detailView(item, { onEdit }) {
    const type = TYPES[item.type];
    const details = typeDetails(item);
    const actionButton = (iconName, label, onClick, extraClass) =>
        h("button", { type: "button", class: ["icon-btn", extraClass], title: label, "aria-label": label, onClick }, icon(iconName));

    const actions = item.trashedAt
        ? [
              h("button", { type: "button", class: "btn btn--primary", onClick: () => restoreItem(item) }, icon("fa-rotate-left"), ` ${t("common.restore")}`),
          ]
        : [
              actionButton("fa-thumbtack", item.pinned ? t("item.unpin") : t("item.pin"), () => togglePin(item), item.pinned && "is-active"),
              actionButton("fa-star", item.favorite ? t("item.unfavorite") : t("item.favorite"), () => toggleFavorite(item), item.favorite && "is-active"),
              actionButton("fa-clone", t("item.duplicate"), async () => {
                  const copy = await duplicateItem(item);
                  if (copy) onEdit.navigate(itemHref(copy));
              }),
              actionButton("fa-trash-can", t("item.trash"), async () => {
                  if (await trashItem(item)) onEdit.navigate(`/${type.route}`);
              }),
              h("button", { type: "button", class: "btn btn--primary", onClick: onEdit.start }, icon("fa-pen"), ` ${t("common.edit")}`),
          ];

    const meta = details.meta.filter(Boolean);
    return h(
        "article",
        { class: "detail" },
        item.trashedAt && h("div", { class: "callout callout--warning" }, icon("fa-trash-can"), h("span", {}, t("item.inTrash", { when: relativeTime(item.trashedAt) }))),
        h(
            "header",
            { class: "detail__header" },
            h("a", { class: "detail__back", href: `/${type.route}` }, icon("fa-arrow-left"), ` ${type.plural}`),
            h(
                "div",
                { class: "detail__title-row" },
                h("h1", { class: "detail__title" }, h("span", { class: `type-dot type-dot--${item.type} type-dot--lg` }, icon(type.icon)), displayTitle(item)),
                h("div", { class: "detail__actions" }, actions)
            ),
            tagList(item.tags)
        ),
        details.lead,
        meta.length ? h("dl", { class: "meta" }, meta) : null,
        ...(details.sections ?? []),
        item.body?.trim() && h("section", { class: "detail__section" }, renderMarkdown(item.body)),
        details.after,
        h("footer", { class: "detail__footer" }, t("item.footer", { created: formatDateTime(item.createdAt), updated: relativeTime(item.updatedAt) }), h("span", { class: "hide-sm" }, ` · ${t("item.editShortcut")}`))
    );
}

// ─── Tahrirlash rejimi ────────────────────────────────────────────

function editorView({ type, item, isNew, onSaved, onCancel, setDirty: reportDirty }) {
    const controls = type.fields.map((field) => ({ field, control: createField(field, item[field.key]) }));
    // Forma yopilgandan keyin (saqlash/bekor qilish) kelgan hodisalar holatni o'zgartirmasin:
    // brauzer DOM'dan olib tashlangan inputda ham "change" chiqarishi mumkin.
    let finished = false;
    const setDirty = (value) => {
        if (!finished || value === false) reportDirty(value);
    };
    const finish = () => {
        finished = true;
        reportDirty(false);
    };
    const error = h("div", { class: "callout callout--danger", role: "alert", hidden: true });
    const saveButton = h("button", { type: "submit", class: "btn btn--primary" }, icon("fa-floppy-disk"), ` ${isNew ? t("common.save") : t("item.saveChanges")}`);

    const collect = () => {
        const values = {};
        for (const { field, control } of controls) values[field.key] = control.get();
        return values;
    };
    const initial = JSON.stringify(collect());
    const isDirty = () => JSON.stringify(collect()) !== initial;

    async function save() {
        const problems = controls.map(({ control }) => control.validate()).filter(Boolean);
        if (problems.length) {
            controls.find(({ control }) => control.validate())?.control.focus();
            return;
        }
        const values = collect();
        if (type.key === "link" && !values.title) values.title = hostname(values.url);
        if (type.key === "task") {
            if (values.status === "done" && item.status !== "done") values.completedAt = new Date().toISOString();
            if (values.status !== "done") values.completedAt = null;
        }

        saveButton.disabled = true;
        saveButton.classList.add("btn--loading");
        error.hidden = true;
        try {
            const saved = isNew ? await store.create(type.key, { ...item, ...values }) : await store.update(item.id, values);
            finish();
            toast.success(isNew ? t(`types.${type.key}.added`) : t("common.saved"));
            onSaved(saved);
        } catch (err) {
            if (err instanceof ConflictError && err.serverItem) {
                const overwrite = await confirmDialog({
                    title: t("item.conflictTitle"),
                    message: t("item.conflictText"),
                    confirmText: t("item.conflictMine"),
                    cancelText: t("item.conflictServer"),
                });
                if (overwrite) {
                    const saved = await store.overwrite({ ...err.serverItem, ...values }, err.serverVersion);
                    finish();
                    toast.success(t("common.saved"));
                    onSaved(saved);
                } else {
                    finish();
                    onCancel();
                }
                return;
            }
            error.replaceChildren(icon("fa-circle-exclamation"), h("span", {}, err.message));
            error.hidden = false;
        } finally {
            saveButton.disabled = false;
            saveButton.classList.remove("btn--loading");
        }
    }

    const form = h(
        "form",
        {
            class: "editor",
            novalidate: true,
            onSubmit: (event) => {
                event.preventDefault();
                save();
            },
            onInput: () => setDirty(isDirty()),
            onChange: () => setDirty(isDirty()),
            onClick: () => setTimeout(() => setDirty(isDirty())),
            onKeydown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    save();
                } else if (event.key === "Escape" && !event.target.closest("dialog")) {
                    onCancel(finish);
                }
            },
        },
        h(
            "header",
            { class: "editor__header" },
            h("h1", { class: "editor__title" }, h("span", { class: `type-dot type-dot--${type.key} type-dot--lg` }, icon(type.icon)), isNew ? t(`types.${type.key}.new`) : t("item.editing", { title: displayTitle(item) })),
            type.sensitive && h("p", { class: "text-muted" }, icon("fa-lock"), ` ${t("item.sensitiveNote")}`)
        ),
        h("div", { class: "editor__fields" }, controls.map(({ control }) => control.el)),
        error,
        h(
            "footer",
            { class: "editor__footer" },
            h("span", { class: "text-muted hide-sm" }, t("item.shortcuts")),
            h("button", { type: "button", class: "btn btn--ghost", onClick: () => onCancel(finish) }, t("common.cancel")),
            saveButton
        )
    );

    setTimeout(() => controls[0]?.control.focus(), 30);
    return form;
}

// ─── Sahifa ───────────────────────────────────────────────────────

export function itemView({ params, query, navigate, setLeaveGuard }) {
    const type = typeByRoute(params.collection);
    if (!type) return null;

    const isNew = params.id === "new";
    const root = h("div", { class: "item-page" });
    let mode = isNew ? "edit" : "view";
    let dirty = false;
    let active = true; // sahifadan chiqilgach eski forma hodisalari e'tiborsiz qolsin
    let unsubscribe = () => {};

    const beforeUnload = (event) => {
        if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);

    const setDirty = (value) => {
        if (!active) return;
        dirty = value;
        setLeaveGuard(
            value
                ? () =>
                      confirmDialog({
                          title: t("item.unsavedTitle"),
                          message: t("item.unsavedText"),
                          confirmText: t("item.leave"),
                          cancelText: t("item.stay"),
                          danger: true,
                      })
                : null
        );
    };

    function prefill() {
        const data = {};
        if (query.project && store.get(query.project)?.type === "project") data.projectId = query.project;
        if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) data[type.key === "journal" ? "date" : "dueDate"] = query.date;
        if (query.title) data.title = query.title.slice(0, 300);
        if (query.url && safeUrl(query.url)) data.url = query.url;
        return data;
    }

    function render() {
        const item = isNew
            ? { type: type.key, title: "", body: "", tags: [], ...structuredClone(type.defaults), ...(type.dynamicDefaults?.() ?? {}), ...prefill() }
            : store.get(params.id);

        if (!item || item.type !== type.key) {
            setChildren(root, emptyState({ iconName: "fa-circle-question", title: t("item.notFound"), text: t("item.notFoundText"), action: { label: type.plural, href: `/${type.route}`, icon: "fa-arrow-left" } }));
            return;
        }
        document.title = `${isNew ? t(`types.${type.key}.new`) : displayTitle(item)} — ${t("app.name")}`;

        if (mode === "edit") {
            setChildren(root, 
                editorView({
                    type,
                    item,
                    isNew,
                    setDirty,
                    onSaved: (saved) => {
                        if (isNew) navigate(itemHref(saved), { replace: true, force: true });
                        else {
                            mode = "view";
                            render();
                        }
                    },
                    onCancel: async (finishEditor = () => {}) => {
                        if (isNew) return navigate(`/${type.route}`);
                        if (dirty && !(await confirmDialog({ title: t("common.cancel"), message: t("item.discardText"), confirmText: t("item.discardConfirm"), danger: true }))) return;
                        finishEditor();
                        mode = "view";
                        render();
                    },
                })
            );
        } else {
            setChildren(root, 
                detailView(item, {
                    onEdit: {
                        start: () => {
                            mode = "edit";
                            render();
                        },
                        navigate,
                    },
                })
            );
        }
    }

    render();
    // Ko'rish rejimida boshqa joyda (masalan, boshqa qurilmada) o'zgarsa — yangilaymiz
    unsubscribe = store.subscribe(() => {
        if (mode === "view") render();
    });

    const onKey = (event) => {
        if (mode === "view" && event.key === "e" && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) && !document.querySelector("dialog[open]")) {
            const item = store.get(params.id);
            if (item && !item.trashedAt) {
                event.preventDefault();
                mode = "edit";
                render();
            }
        }
    };
    document.addEventListener("keydown", onKey);

    return {
        title: isNew ? t(`types.${type.key}.new`) : displayTitle(store.get(params.id) ?? { title: type.label }),
        el: root,
        cleanup: () => {
            setLeaveGuard(null);
            active = false;
            unsubscribe();
            window.removeEventListener("beforeunload", beforeUnload);
            document.removeEventListener("keydown", onKey);
        },
    };
}
