/**
 * Ilova qobig'i (vault ochiq bo'lganda): yon menyu, yuqori panel va asosiy kontent maydoni.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { TYPE_ORDER, TYPES } from "../models/types.js";
import { auth } from "../services/auth.js";
import { isOverdue, todayISO } from "../services/analytics.js";
import { settings } from "../services/settings.js";
import { h, icon, kbd, modKey } from "../ui/dom.js";
import { openPalette } from "../ui/palette.js";
import { applyTheme, effectiveTheme } from "../ui/theme.js";

export function createShell({ navigate }) {
    const counters = new Map();
    const navLinks = [];

    const navLink = (href, iconName, label, { counterKey, exact = false } = {}) => {
        const counter = counterKey ? h("span", { class: "nav__count" }) : null;
        if (counter) counters.set(counterKey, counter);
        const link = h("a", { class: "nav__link", href, dataset: { exact: String(exact) } }, icon(iconName), h("span", { class: "nav__label" }, label), counter);
        navLinks.push(link);
        return h("li", {}, link);
    };

    const sidebar = h(
        "aside",
        { class: "sidebar", id: "sidebar" },
        h("a", { class: "brand", href: "/" }, h("span", { class: "brand__logo" }, icon("fa-vault")), h("span", {}, t("app.name"))),
        h(
            "nav",
            { class: "nav", "aria-label": t("nav.main") },
            h("ul", {}, navLink("/", "fa-house", t("nav.home"), { exact: true }), navLink("/advisor", "fa-lightbulb", t("nav.advisor"))),
            h("p", { class: "nav__heading" }, t("nav.sections")),
            h("ul", {}, TYPE_ORDER.map((key) => navLink(`/${TYPES[key].route}`, TYPES[key].icon, TYPES[key].plural, { counterKey: key }))),
            h("p", { class: "nav__heading" }, t("nav.other")),
            h(
                "ul",
                {},
                navLink("/tags", "fa-tags", t("nav.tags")),
                navLink("/trash", "fa-trash-can", t("nav.trash"), { counterKey: "trash" }),
                navLink("/settings", "fa-gear", t("nav.settings")),
                auth.account?.user.isAdmin && navLink("/admin", "fa-user-shield", t("nav.admin"))
            )
        ),
        h("div", { class: "sidebar__footer" }, h("span", { class: "sidebar__secure" }, icon("fa-shield-halved"), ` ${t("app.e2e")}`))
    );

    const lock = () => auth.lock();
    const palette = () => openPalette({ navigate, lock });

    const themeButton = h("button", { type: "button", class: "icon-btn", "aria-label": t("theme.toggle") });
    const syncThemeIcon = () => {
        const dark = effectiveTheme() === "dark";
        themeButton.replaceChildren(icon(dark ? "fa-sun" : "fa-moon"));
        themeButton.title = dark ? t("theme.light") : t("theme.dark");
    };
    themeButton.addEventListener("click", async () => {
        const next = effectiveTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        syncThemeIcon();
        settings.update({ theme: next }).catch(() => {});
    });
    syncThemeIcon();

    const addMenu = h(
        "div",
        { class: "menu", hidden: true, role: "menu" },
        TYPE_ORDER.map((key) =>
            h("a", { class: "menu__item", role: "menuitem", href: `/${TYPES[key].route}/new`, onClick: () => (addMenu.hidden = true) }, h("span", { class: `type-dot type-dot--${key}` }, icon(TYPES[key].icon)), TYPES[key].label)
        )
    );
    const addButton = h(
        "button",
        {
            type: "button",
            class: "btn btn--primary",
            "aria-haspopup": "menu",
            onClick: (event) => {
                event.stopPropagation();
                addMenu.hidden = !addMenu.hidden;
            },
        },
        icon("fa-plus"),
        h("span", { class: "hide-sm" }, ` ${t("common.new")}`)
    );
    const closeMenu = () => (addMenu.hidden = true);
    document.addEventListener("click", closeMenu);

    const menuToggle = h(
        "button",
        {
            type: "button",
            class: "icon-btn topbar__menu",
            "aria-label": t("nav.menu"),
            "aria-controls": "sidebar",
            onClick: () => document.body.classList.toggle("sidebar-open"),
        },
        icon("fa-bars")
    );

    const topbar = h(
        "header",
        { class: "topbar" },
        menuToggle,
        h("button", { type: "button", class: "search-trigger", onClick: palette }, icon("fa-magnifying-glass"), h("span", {}, t("common.searchEllipsis")), kbd(modKey, "K")),
        h(
            "div",
            { class: "topbar__actions" },
            h("div", { class: "menu-anchor" }, addButton, addMenu),
            themeButton,
            h("button", { type: "button", class: "icon-btn", title: t("shell.lockTitle"), "aria-label": t("palette.lock"), onClick: lock }, icon("fa-lock"))
        )
    );

    const content = h("main", { class: "content", id: "content", tabIndex: -1 });
    const backdrop = h("div", { class: "sidebar-backdrop", onClick: () => document.body.classList.remove("sidebar-open") });
    const el = h("div", { class: "app" }, sidebar, backdrop, h("div", { class: "app__main" }, topbar, content));

    const updateCounters = () => {
        const today = todayISO();
        for (const key of TYPE_ORDER) {
            const items = store.byType(key);
            const value =
                key === "task" ? items.filter((t) => t.status !== "done").length : key === "link" ? items.filter((l) => !l.read).length : items.length;
            counters.get(key).textContent = value || "";
            counters.get(key).classList.toggle("nav__count--alert", key === "task" && items.some((t) => isOverdue(t, today)));
        }
        const trash = store.trashed().length;
        counters.get("trash").textContent = trash || "";
    };
    const unsubscribe = store.subscribe(updateCounters);
    updateCounters();

    const onKeydown = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            palette();
        } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
            event.preventDefault();
            lock();
        }
    };
    document.addEventListener("keydown", onKeydown);

    return {
        el,
        setContent(node) {
            content.replaceChildren(node);
            document.body.classList.remove("sidebar-open");
        },
        setActive(path) {
            for (const link of navLinks) {
                const href = link.getAttribute("href");
                const active = link.dataset.exact === "true" ? path === href : path === href || path.startsWith(`${href}/`);
                link.classList.toggle("is-active", active);
                if (active) link.setAttribute("aria-current", "page");
                else link.removeAttribute("aria-current");
            }
        },
        destroy() {
            unsubscribe();
            document.removeEventListener("keydown", onKeydown);
            document.removeEventListener("click", closeMenu);
        },
    };
}
