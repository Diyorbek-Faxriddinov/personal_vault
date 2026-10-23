/**
 * Kichik qayta ishlatiladigan UI bloklari: belgi (badge), progress, bo'sh holat, teglar, sarlavha.
 */
import { t } from "../core/i18n.js";
import { h, icon } from "./dom.js";

export const badge = (text, { tone = "muted", iconName } = {}) =>
    h("span", { class: `badge badge--${tone}` }, iconName && icon(iconName), text);

export function progressBar(percent, { label, tone } = {}) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    return h(
        "div",
        { class: ["progress", tone && `progress--${tone}`], role: "progressbar", "aria-valuenow": value, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label ?? t("common.progress") },
        h("span", { class: "progress__bar", style: { width: `${value}%` } })
    );
}

export function emptyState({ iconName = "fa-inbox", title, text, action }) {
    return h(
        "div",
        { class: "empty" },
        h("div", { class: "empty__icon" }, icon(iconName)),
        h("h3", { class: "empty__title" }, title),
        text && h("p", { class: "empty__text" }, text),
        action && h("a", { class: "btn btn--primary", href: action.href }, icon(action.icon ?? "fa-plus"), " ", action.label)
    );
}

export const tagList = (tags = [], { link = true } = {}) =>
    tags.length
        ? h(
              "span",
              { class: "tag-list" },
              tags.map((tag) =>
                  link ? h("a", { class: "tag", href: `/tags/${encodeURIComponent(tag)}` }, `#${tag}`) : h("span", { class: "tag" }, `#${tag}`)
              )
          )
        : null;

export function pageHeader({ title, subtitle, iconName, actions = [] }) {
    return h(
        "header",
        { class: "page-header" },
        h(
            "div",
            { class: "page-header__text" },
            h("h1", { class: "page-header__title" }, iconName && icon(iconName), title),
            subtitle && h("p", { class: "page-header__subtitle" }, subtitle)
        ),
        actions.length ? h("div", { class: "page-header__actions" }, actions) : null
    );
}

export function section({ title, iconName, action, children, className }) {
    return h(
        "section",
        { class: ["panel", className] },
        h(
            "header",
            { class: "panel__header" },
            h("h2", { class: "panel__title" }, iconName && icon(iconName), title),
            action
        ),
        h("div", { class: "panel__body" }, children)
    );
}

export const spinner = (label = t("common.loading")) => h("div", { class: "spinner-wrap", role: "status" }, h("span", { class: "spinner" }), h("span", { class: "visually-hidden" }, label));
