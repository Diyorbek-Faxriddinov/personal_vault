/**
 * Bitta tur bo'yicha ro'yxat sahifasi (/tasks, /notes, /links, ...).
 * Filtrlash, teg, saralash va ko'rinish (ro'yxat/katak) — hammasi mahalliy, ochilgan ma'lumot ustida.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { displayTitle, TYPES } from "../models/types.js";
import { groupTasks, journalStreak, moodAverage, todayISO } from "../services/analytics.js";
import { searchItems } from "../services/search.js";
import { emptyState, pageHeader } from "../ui/components.js";
import { debounce, h, icon, setChildren } from "../ui/dom.js";
import { formatMonthYear } from "../ui/format.js";
import { journalHeatmap } from "../ui/heatmap.js";
import { itemCard } from "../ui/item-card.js";

/** Nomi — "sort.<kalit>" (joriy tilda) */
const SORTS = {
    updated: { compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
    created: { compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
    title: { compare: (a, b) => displayTitle(a).localeCompare(displayTitle(b)) },
    date: { compare: (a, b) => (b.date ?? "").localeCompare(a.date ?? "") },
    deadline: { compare: (a, b) => (a.deadline ?? a.targetDate ?? "9999").localeCompare(b.deadline ?? b.targetDate ?? "9999") },
};

const DEFAULT_SORT = { journal: "date", secret: "title", project: "deadline", learning: "updated" };
const GRID_TYPES = new Set(["note", "project", "learning", "link"]);

/** Sahifadan chiqib qaytganda filtrlar saqlanib qolsin (faqat xotirada) */
const viewState = new Map();

function stateFor(typeKey) {
    if (!viewState.has(typeKey)) {
        viewState.set(typeKey, { query: "", filter: null, tag: "", sort: DEFAULT_SORT[typeKey] ?? "updated", layout: "list", showDone: false });
    }
    return viewState.get(typeKey);
}

export function collectionView({ params, navigate }) {
    const type = Object.values(TYPES).find((t) => t.route === params.collection);
    if (!type) return null;

    const state = stateFor(type.key);
    const root = h("div", { class: "collection" });
    const listHost = h("div", { class: "collection__list" });
    const summary = h("p", { class: "collection__summary text-muted" });

    // ─── Asboblar paneli ───
    const searchInput = h("input", {
        class: "input input--search",
        type: "search",
        placeholder: t("collection.searchIn", { plural: type.plural }),
        value: state.query,
        "aria-label": t("common.search"),
        onInput: debounce((event) => {
            state.query = event.target.value;
            renderList();
        }, 120),
    });

    const tagSelect = h("select", {
        class: "input select select--sm",
        "aria-label": t("collection.tagFilter"),
        onChange: (event) => {
            state.tag = event.target.value;
            renderList();
        },
    });

    const sortSelect = h(
        "select",
        {
            class: "input select select--sm",
            "aria-label": t("collection.sort"),
            onChange: (event) => {
                state.sort = event.target.value;
                renderList();
            },
        },
        Object.entries(SORTS)
            .filter(([key]) => (key === "date" ? type.key === "journal" : key === "deadline" ? ["project", "learning"].includes(type.key) : true))
            .map(([key]) => h("option", { value: key, selected: key === state.sort }, t(`sort.${key}`)))
    );

    const isActiveFilter = (option) => (option.value === null ? !state.filter : state.filter?.value === option.value);
    const filterChips = (type.filters ?? []).flatMap((filter) =>
        [{ value: null, label: t("common.all") }, ...filter.options].map((option) => {
            const chip = h(
                "button",
                {
                    type: "button",
                    class: ["chip", isActiveFilter(option) && "is-active"],
                    "aria-pressed": String(isActiveFilter(option)),
                    onClick: () => {
                        state.filter = option.value === null ? null : { key: filter.key, value: option.value };
                        filterChips.forEach((c) => {
                            c.classList.toggle("is-active", c === chip);
                            c.setAttribute("aria-pressed", String(c === chip));
                        });
                        renderList();
                    },
                },
                option.label
            );
            return chip;
        })
    );

    const layoutToggle = GRID_TYPES.has(type.key)
        ? h(
              "div",
              { class: "segmented", role: "group", "aria-label": t("collection.layout") },
              [
                  ["list", "fa-list", t("collection.list")],
                  ["grid", "fa-table-cells-large", t("collection.grid")],
              ].map(([value, iconName, label]) =>
                  h(
                      "button",
                      {
                          type: "button",
                          class: ["segmented__btn", state.layout === value && "is-active"],
                          title: label,
                          "aria-label": label,
                          "aria-pressed": String(state.layout === value),
                          onClick: (event) => {
                              state.layout = value;
                              event.currentTarget.parentElement.querySelectorAll("button").forEach((b) => {
                                  b.classList.toggle("is-active", b === event.currentTarget);
                                  b.setAttribute("aria-pressed", String(b === event.currentTarget));
                              });
                              renderList();
                          },
                      },
                      icon(iconName)
                  )
              )
          )
        : null;

    // ─── Ro'yxat ───
    function visibleItems() {
        let items = store.byType(type.key);
        if (state.filter) items = items.filter((item) => item[state.filter.key] === state.filter.value);
        if (state.tag) items = items.filter((item) => item.tags?.includes(state.tag));
        if (state.query.trim()) return searchItems(items, state.query, { limit: 1000 }).map((r) => r.item);
        return items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || SORTS[state.sort].compare(a, b));
    }

    function renderTags() {
        const tags = new Map();
        for (const item of store.byType(type.key)) for (const tag of item.tags ?? []) tags.set(tag, (tags.get(tag) ?? 0) + 1);
        tagSelect.replaceChildren(
            h("option", { value: "" }, t("tags.all")),
            ...[...tags.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => h("option", { value: tag, selected: tag === state.tag }, `#${tag} (${count})`))
        );
        tagSelect.hidden = tags.size === 0;
    }

    const cards = (items) => h("div", { class: ["card-list", state.layout === "grid" && GRID_TYPES.has(type.key) && "card-list--grid"] }, items.map((item) => itemCard(item)));

    function renderList() {
        const items = visibleItems();
        const total = store.byType(type.key).length;
        summary.textContent = total ? (items.length === total ? t("common.itemsCount", { count: total }) : t("common.itemsOf", { shown: items.length, count: total })) : "";

        if (!total) {
            setChildren(listHost, 
                emptyState({
                    iconName: type.icon,
                    title: t(`types.${type.key}.empty`),
                    text: type.description,
                    action: { label: t(`types.${type.key}.add`), href: `/${type.route}/new` },
                })
            );
            return;
        }
        if (!items.length) {
            setChildren(listHost, emptyState({ iconName: "fa-magnifying-glass", title: t("common.nothingFound"), text: t("collection.noMatchText") }));
            return;
        }

        if (type.key === "task" && !state.query.trim()) {
            setChildren(listHost, 
                ...groupTasks(items, todayISO()).map((group) => {
                    if (group.collapsed) {
                        return h(
                            "details",
                            { class: "task-group task-group--done", open: state.showDone, onToggle: (event) => (state.showDone = event.currentTarget.open) },
                            h("summary", { class: "task-group__title" }, group.label, h("span", { class: "task-group__count" }, group.items.length)),
                            cards(group.items)
                        );
                    }
                    return h(
                        "section",
                        { class: `task-group task-group--${group.key}` },
                        h("h2", { class: ["task-group__title", group.tone && `tone-${group.tone}`] }, group.label, h("span", { class: "task-group__count" }, group.items.length)),
                        cards(group.items)
                    );
                })
            );
            return;
        }

        if (type.key === "journal" && state.sort === "date" && !state.query.trim()) {
            const byMonth = new Map();
            for (const item of items) {
                const key = (item.date ?? "").slice(0, 7);
                if (!byMonth.has(key)) byMonth.set(key, []);
                byMonth.get(key).push(item);
            }
            setChildren(listHost, 
                ...[...byMonth.entries()].map(([key, entries]) =>
                    h(
                        "section",
                        { class: "task-group" },
                        h("h2", { class: "task-group__title" }, key ? formatMonthYear(Number(key.slice(0, 4)), Number(key.slice(5)) - 1) : t("collection.noDate"), h("span", { class: "task-group__count" }, entries.length)),
                        cards(entries)
                    )
                )
            );
            return;
        }

        setChildren(listHost, cards(items));
    }

    function journalHeader() {
        const entries = store.byType("journal");
        const today = todayISO();
        const streak = journalStreak(entries, today);
        const mood = moodAverage(entries, 30, today);
        return h(
            "div",
            { class: "panel journal-overview" },
            h(
                "div",
                { class: "journal-overview__stats" },
                h("div", {}, h("strong", {}, `🔥 ${streak.current}`), h("span", {}, t("journal.streak", { count: streak.current }))),
                h("div", {}, h("strong", {}, streak.longest), h("span", {}, t("journal.longest"))),
                h("div", {}, h("strong", {}, streak.total), h("span", {}, t("journal.total"))),
                h("div", {}, h("strong", {}, mood ? mood.average.toFixed(1) : "—"), h("span", {}, t("journal.mood30")))
            ),
            journalHeatmap(entries, {
                hrefFor: (date, entry) => (entry ? `/journal/${entry.id}` : `/journal/new?date=${date}`),
            })
        );
    }

    const headerActions = [
        type.key === "journal" && h("a", { class: "btn btn--ghost", href: "/journal/today" }, icon("fa-pen-nib"), ` ${t("insight.todayEntry")}`),
        h("a", { class: "btn btn--primary", href: `/${type.route}/new` }, icon("fa-plus"), ` ${type.label}`),
    ].filter(Boolean);

    const journalHost = h("div");
    function render() {
        renderTags();
        if (type.key === "journal") setChildren(journalHost, journalHeader());
        renderList();
    }

    root.append(
        pageHeader({ title: type.plural, subtitle: type.description, iconName: type.icon, actions: headerActions }),
        journalHost,
        h(
            "div",
            { class: "toolbar" },
            searchInput,
            filterChips.length ? h("div", { class: "collection__filters chips" }, filterChips) : null,
            h("div", { class: "toolbar__end" }, tagSelect, sortSelect, layoutToggle)
        ),
        summary,
        listHost
    );

    render();
    const unsubscribe = store.subscribe(render);

    // "/" — qidiruvga fokus
    const onKey = (event) => {
        if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
            event.preventDefault();
            searchInput.focus();
        } else if (event.key === "n" && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
            navigate(`/${type.route}/new`);
        }
    };
    document.addEventListener("keydown", onKey);

    return {
        title: type.plural,
        el: root,
        cleanup: () => {
            unsubscribe();
            document.removeEventListener("keydown", onKey);
        },
    };
}
