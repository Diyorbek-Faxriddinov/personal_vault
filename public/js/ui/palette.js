/**
 * Buyruqlar oynasi (Ctrl+K): istalgan yozuvni qidirish va tezkor amallar — sichqonchasiz.
 * ↑/↓ — tanlash, Enter — ochish, Esc — yopish.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { displayTitle, TYPE_ORDER, TYPES } from "../models/types.js";
import { searchItems } from "../services/search.js";
import { debounce, h, icon, kbd } from "./dom.js";
import { itemHref } from "./item-card.js";

let open = null;

function commands({ navigate, lock }) {
    return [
        ...TYPE_ORDER.map((key) => ({
            label: t(`types.${key}.new`),
            keywords: `${t("palette.kw.new")} ${TYPES[key].label} ${TYPES[key].plural}`,
            icon: "fa-plus",
            run: () => navigate(`/${TYPES[key].route}/new`),
        })),
        { label: t("nav.home"), keywords: t("palette.kw.home"), icon: "fa-house", run: () => navigate("/") },
        ...TYPE_ORDER.map((key) => ({ label: TYPES[key].plural, keywords: TYPES[key].plural, icon: TYPES[key].icon, run: () => navigate(`/${TYPES[key].route}`) })),
        { label: t("palette.todayJournal"), keywords: t("palette.kw.journal"), icon: "fa-pen-nib", run: () => navigate("/journal/today") },
        { label: t("nav.advisor"), keywords: t("palette.kw.advisor"), icon: "fa-lightbulb", run: () => navigate("/advisor") },
        { label: t("nav.tags"), keywords: t("palette.kw.tags"), icon: "fa-tags", run: () => navigate("/tags") },
        { label: t("nav.trash"), keywords: t("palette.kw.trash"), icon: "fa-trash-can", run: () => navigate("/trash") },
        { label: t("nav.settings"), keywords: t("palette.kw.settings"), icon: "fa-gear", run: () => navigate("/settings") },
        { label: t("palette.lock"), keywords: t("palette.kw.lock"), icon: "fa-lock", run: lock },
    ];
}

export function openPalette(ctx) {
    if (open) return open.input.focus();

    const allCommands = commands(ctx);
    let results = [];
    let active = 0;

    const input = h("input", {
        class: "palette__input",
        type: "search",
        placeholder: t("palette.placeholder"),
        "aria-label": t("common.search"),
        autocomplete: "off",
        spellcheck: "false",
    });
    const list = h("ul", { class: "palette__list", role: "listbox" });
    const dialog = h(
        "dialog",
        { class: "palette", "aria-label": t("palette.title") },
        h(
            "div",
            { class: "palette__inner" },
            h("div", { class: "palette__search" }, icon("fa-magnifying-glass"), input, kbd("Esc")),
            list,
            h("footer", { class: "palette__footer" }, kbd("↑", "↓"), ` ${t("palette.hint.select")} `, kbd("Enter"), ` ${t("palette.hint.open")} `, kbd("Esc"), ` ${t("palette.hint.close")}`)
        )
    );

    const close = () => {
        dialog.close();
        dialog.remove();
        open = null;
    };

    const render = () => {
        const query = input.value.trim();
        const normalized = query.toLowerCase();
        const matchedCommands = (query ? allCommands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(normalized)) : allCommands.slice(0, 8)).map(
            (command) => ({ kind: "command", ...command })
        );
        const matchedItems = query
            ? searchItems(store.all(), query, { limit: 12 }).map(({ item, snippet }) => ({
                  kind: "item",
                  label: displayTitle(item),
                  item,
                  snippet,
                  icon: TYPES[item.type].icon,
                  run: () => ctx.navigate(itemHref(item)),
              }))
            : store
                  .all()
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 5)
                  .map((item) => ({ kind: "item", label: displayTitle(item), item, icon: TYPES[item.type].icon, run: () => ctx.navigate(itemHref(item)) }));

        results = [...matchedItems, ...matchedCommands];
        active = Math.min(active, Math.max(results.length - 1, 0));

        if (!results.length) {
            list.replaceChildren(h("li", { class: "palette__empty" }, t("common.nothingFound")));
            return;
        }
        let lastKind = null;
        list.replaceChildren(
            ...results.flatMap((result, index) => {
                const nodes = [];
                if (result.kind !== lastKind) {
                    nodes.push(h("li", { class: "palette__group", role: "presentation" }, result.kind === "item" ? (query ? t("palette.items") : t("palette.recent")) : t("palette.actions")));
                    lastKind = result.kind;
                }
                nodes.push(
                    h(
                        "li",
                        {
                            class: ["palette__option", index === active && "is-active"],
                            role: "option",
                            "aria-selected": String(index === active),
                            onMousemove: () => {
                                if (active !== index) {
                                    active = index;
                                    render();
                                }
                            },
                            onClick: () => {
                                close();
                                result.run();
                            },
                        },
                        h("span", { class: result.item ? `type-dot type-dot--${result.item.type}` : "palette__icon" }, icon(result.icon)),
                        h(
                            "span",
                            { class: "palette__text" },
                            h("span", { class: "palette__label" }, result.label),
                            result.snippet && h("span", { class: "palette__snippet" }, result.snippet)
                        ),
                        result.item && h("span", { class: "palette__type" }, TYPES[result.item.type].label)
                    )
                );
                return nodes;
            })
        );
        list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
    };

    input.addEventListener("input", debounce(() => {
        active = 0;
        render();
    }, 80));
    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            active = (active + 1) % Math.max(results.length, 1);
            render();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            active = (active - 1 + results.length) % Math.max(results.length, 1);
            render();
        } else if (event.key === "Enter" && results[active]) {
            event.preventDefault();
            const chosen = results[active];
            close();
            chosen.run();
        }
    });
    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close();
    });
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) close();
    });

    document.body.append(dialog);
    dialog.showModal();
    open = { input };
    render();
    input.focus();
}
