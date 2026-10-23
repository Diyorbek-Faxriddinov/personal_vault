/**
 * Admin panel: tizim statistikasi, foydalanuvchilarni boshqarish va umumiy xavfsizlik jurnali.
 * Admin foydalanuvchilarning yozuvlarini ko'ra olmaydi — ular shifrlangan, kalit faqat egasida.
 */
import { api } from "../core/api.js";
import { t } from "../core/i18n.js";
import { auth } from "../services/auth.js";
import { reportError } from "../services/actions.js";
import { AUDIT_EVENTS, auditLabel, WARNING_EVENTS } from "../ui/audit.js";
import { badge, emptyState, pageHeader, section, spinner } from "../ui/components.js";
import { confirmDialog, openModal } from "../ui/dialog.js";
import { debounce, h, icon, setChildren } from "../ui/dom.js";
import { describeUserAgent, formatBytes, formatDateTime, relativeTime } from "../ui/format.js";
import { toast } from "../ui/toast.js";

const PAGE_SIZE = 25;

function statTile(iconName, label, value, hint, tone = "primary") {
    return h(
        "div",
        { class: "stat" },
        h("span", { class: `stat__icon tone-${tone}` }, icon(iconName)),
        h("span", { class: "stat__text" }, h("span", { class: "stat__value" }, value), h("span", { class: "stat__label" }, label), hint && h("span", { class: "stat__hint" }, hint))
    );
}

/** O'chirishni tasdiqlash: xato bosib yubormaslik uchun email qayta yoziladi */
function confirmDeleteDialog(user) {
    let input;
    let button;
    const modal = openModal({
        title: t("admin.deleteTitle"),
        size: "sm",
        content: (close) =>
            h(
                "form",
                {
                    class: "stack",
                    onSubmit: (event) => {
                        event.preventDefault();
                        if (input.value.trim().toLowerCase() === user.email) close(true);
                    },
                },
                h("div", { class: "callout callout--danger" }, icon("fa-triangle-exclamation"), h("span", {}, t("admin.deleteText", { email: user.email, count: user.itemCount }))),
                h(
                    "label",
                    { class: "field" },
                    h("span", { class: "field__label" }, t("admin.typeEmail")),
                    h("input", {
                        class: "input",
                        placeholder: user.email,
                        autocomplete: "off",
                        ref: (el) => (input = el),
                        onInput: () => (button.disabled = input.value.trim().toLowerCase() !== user.email),
                    })
                ),
                h(
                    "div",
                    { class: "modal__actions" },
                    h("button", { type: "button", class: "btn btn--ghost", onClick: () => close(false) }, t("common.cancel")),
                    h("button", { type: "submit", class: "btn btn--danger", disabled: true, ref: (el) => (button = el) }, t("common.delete"))
                )
            ),
    });
    setTimeout(() => input.focus(), 50);
    return modal.closed.then(Boolean);
}

export function adminView() {
    if (!auth.account?.user.isAdmin) {
        return {
            title: t("admin.deniedTitle"),
            el: emptyState({ iconName: "fa-lock", title: t("admin.deniedHeading"), text: t("admin.deniedText"), action: { label: t("nav.home"), href: "/", icon: "fa-house" } }),
        };
    }

    const state = { query: "", page: 1, auditEvent: "", auditUser: null };
    const statsHost = h("div", { class: "stats stats--admin" }, spinner());
    const usersHost = h("div", {}, spinner());
    const auditHost = h("div", {}, spinner());
    const auditFilterLabel = h("span");

    async function loadStats() {
        try {
            const s = await api.get("/admin/stats");
            setChildren(
                statsHost,
                statTile("fa-users", t("admin.stat.users"), s.users, s.disabled_users ? t("admin.stat.blocked", { count: s.disabled_users }) : t("admin.stat.noBlocked")),
                statTile("fa-user-clock", t("admin.stat.active"), s.active_users_30d, t("admin.stat.new", { count: s.new_users_30d }), "success"),
                statTile("fa-database", t("admin.stat.storage"), formatBytes(s.storage_bytes), t("admin.stat.storageHint", { count: s.items, size: formatBytes(s.database_bytes) }), "info"),
                statTile("fa-triangle-exclamation", t("admin.stat.failed"), s.failed_logins_24h, t("admin.stat.sessions", { count: s.active_sessions }), s.failed_logins_24h ? "danger" : "warning")
            );
        } catch (error) {
            setChildren(statsHost, h("p", { class: "field__error" }, error.message));
        }
    }

    async function act(work, message) {
        try {
            await work();
            if (message) toast.success(message);
            await Promise.all([loadUsers(), loadStats(), loadAudit()]);
        } catch (error) {
            reportError(error);
        }
    }

    function userActions(user) {
        if (user.isAdmin) return h("span", { class: "text-muted text-sm" }, "—");
        const button = (iconName, label, onClick, extra) =>
            h("button", { type: "button", class: ["icon-btn icon-btn--ghost icon-btn--sm", extra], title: label, "aria-label": `${label}: ${user.email}`, onClick }, icon(iconName));
        return h(
            "div",
            { class: "admin-actions" },
            button("fa-clock-rotate-left", t("admin.viewLog"), () => {
                state.auditUser = user;
                loadAudit();
                auditHost.scrollIntoView({ behavior: "smooth", block: "start" });
            }),
            user.disabledAt
                ? button("fa-user-check", t("admin.unblock"), () => act(() => api.post(`/admin/users/${user.id}/enable`), t("admin.unblocked", { email: user.email })))
                : button("fa-user-lock", t("admin.block"), async () => {
                      const ok = await confirmDialog({
                          title: t("admin.blockTitle"),
                          message: t("admin.blockText", { email: user.email }),
                          confirmText: t("admin.block"),
                          danger: true,
                      });
                      if (ok) act(() => api.post(`/admin/users/${user.id}/disable`), t("admin.blocked", { email: user.email }));
                  }),
            button("fa-plug-circle-xmark", t("admin.signOutAll"), async () => {
                if (await confirmDialog({ title: t("admin.signOutTitle"), message: t("admin.signOutText", { email: user.email }), confirmText: t("settings.signOutSession") })) {
                    act(async () => {
                        const { revoked } = await api.delete(`/admin/users/${user.id}/sessions`);
                        toast.success(t("admin.sessionsClosed", { count: revoked }));
                    });
                }
            }),
            button(
                "fa-trash-can",
                t("common.delete"),
                async () => {
                    if (await confirmDeleteDialog(user)) act(() => api.delete(`/admin/users/${user.id}`), t("admin.deleted", { email: user.email }));
                },
                "admin-actions__danger"
            )
        );
    }

    async function loadUsers() {
        try {
            const params = new URLSearchParams({ query: state.query, page: String(state.page), pageSize: String(PAGE_SIZE) });
            const { users, total } = await api.get(`/admin/users?${params}`);
            const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            const me = auth.account.user.id;

            setChildren(
                usersHost,
                users.length
                    ? h(
                          "div",
                          { class: "table-wrap" },
                          h(
                              "table",
                              { class: "table" },
                              h(
                                  "thead",
                                  {},
                                  h("tr", {}, [t("admin.col.user"), t("admin.col.registered"), t("admin.col.lastLogin"), t("admin.col.items"), t("admin.col.size"), t("admin.col.sessions"), ""].map((title) => h("th", { scope: "col" }, title)))
                              ),
                              h(
                                  "tbody",
                                  {},
                                  users.map((user) =>
                                      h(
                                          "tr",
                                          { class: user.disabledAt ? "is-disabled" : null },
                                          h(
                                              "td",
                                              {},
                                              h("div", { class: "admin-user" }, h("strong", { class: "break" }, user.email), h("span", { class: "cluster cluster--tight" }, user.isAdmin && badge(t("admin.badge.admin"), { tone: "primary", iconName: "fa-user-shield" }), user.id === me && badge(t("admin.badge.you"), { tone: "info" }), user.disabledAt && badge(t("admin.badge.blocked", { when: relativeTime(user.disabledAt) }), { tone: "danger", iconName: "fa-ban" })))
                                          ),
                                          h("td", {}, formatDateTime(user.createdAt)),
                                          h("td", {}, user.lastLoginAt ? relativeTime(user.lastLoginAt) : "—"),
                                          h("td", { class: "num" }, user.itemCount),
                                          h("td", { class: "num" }, formatBytes(user.storageBytes)),
                                          h("td", { class: "num" }, user.sessionCount),
                                          h("td", {}, userActions(user))
                                      )
                                  )
                              )
                          )
                      )
                    : emptyState({ iconName: "fa-user-slash", title: t("admin.noUsers") }),
                pages > 1 &&
                    h(
                        "div",
                        { class: "pager" },
                        h("button", { type: "button", class: "btn btn--ghost btn--sm", disabled: state.page <= 1, onClick: () => ((state.page -= 1), loadUsers()) }, icon("fa-chevron-left"), ` ${t("admin.prev")}`),
                        h("span", { class: "text-muted text-sm" }, t("admin.pageInfo", { page: state.page, pages, total })),
                        h("button", { type: "button", class: "btn btn--ghost btn--sm", disabled: state.page >= pages, onClick: () => ((state.page += 1), loadUsers()) }, `${t("admin.next")} `, icon("fa-chevron-right"))
                    )
            );
        } catch (error) {
            setChildren(usersHost, h("p", { class: "field__error" }, error.message));
        }
    }

    async function loadAudit() {
        setChildren(
            auditFilterLabel,
            state.auditUser &&
                h(
                    "span",
                    { class: "chip is-active" },
                    state.auditUser.email,
                    h(
                        "button",
                        {
                            type: "button",
                            class: "chip__clear",
                            "aria-label": t("admin.clearFilter"),
                            onClick: () => {
                                state.auditUser = null;
                                loadAudit();
                            },
                        },
                        icon("fa-xmark")
                    )
                )
        );
        try {
            const params = new URLSearchParams({ limit: "100" });
            if (state.auditEvent) params.set("event", state.auditEvent);
            if (state.auditUser) params.set("userId", String(state.auditUser.id));
            const { events } = await api.get(`/admin/audit?${params}`);
            setChildren(
                auditHost,
                events.length
                    ? h(
                          "ul",
                          { class: "activity" },
                          events.map((event) => {
                              const [iconName, label] = auditLabel(event.event);
                              return h(
                                  "li",
                                  { class: ["activity__item", WARNING_EVENTS.has(event.event) && "activity__item--warn"] },
                                  icon(iconName),
                                  h("span", { class: "activity__label" }, label, h("span", { class: "text-muted" }, ` — ${event.user.email}`)),
                                  h("span", { class: "text-muted text-sm" }, `${formatDateTime(event.createdAt)} · ${event.ip ?? ""} · ${describeUserAgent(event.userAgent ?? "")}`)
                              );
                          })
                      )
                    : h("p", { class: "text-muted" }, t("admin.noEvents"))
            );
        } catch (error) {
            setChildren(auditHost, h("p", { class: "field__error" }, error.message));
        }
    }

    const search = h("input", {
        class: "input input--search",
        type: "search",
        placeholder: t("admin.searchPlaceholder"),
        "aria-label": t("admin.searchLabel"),
        onInput: debounce((event) => {
            state.query = event.target.value.trim();
            state.page = 1;
            loadUsers();
        }, 250),
    });

    const eventFilter = h(
        "select",
        {
            class: "input select select--sm",
            "aria-label": t("admin.eventType"),
            onChange: (event) => {
                state.auditEvent = event.target.value;
                loadAudit();
            },
        },
        h("option", { value: "" }, t("admin.allEvents")),
        AUDIT_EVENTS.map((value) => h("option", { value }, auditLabel(value)[1]))
    );

    const el = h(
        "div",
        { class: "admin" },
        pageHeader({
            title: t("nav.admin"),
            subtitle: t("admin.subtitle"),
            iconName: "fa-user-shield",
            actions: [h("button", { type: "button", class: "btn btn--ghost", onClick: () => Promise.all([loadStats(), loadUsers(), loadAudit()]) }, icon("fa-rotate"), ` ${t("admin.refresh")}`)],
        }),
        h(
            "div",
            { class: "callout callout--info" },
            icon("fa-user-secret"),
            h("span", {}, t("admin.notice"))
        ),
        statsHost,
        section({ title: t("admin.users"), iconName: "fa-users", action: search, children: usersHost }),
        section({ title: t("admin.auditTitle"), iconName: "fa-clock-rotate-left", action: h("div", { class: "cluster" }, auditFilterLabel, eventFilter), children: auditHost })
    );

    loadStats();
    loadUsers();
    loadAudit();
    return { title: t("nav.admin"), el };
}
