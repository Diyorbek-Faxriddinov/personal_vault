/**
 * Teglar: barcha teglar ro'yxati, teg bo'yicha yozuvlar, tegni qayta nomlash va o'chirish.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { TYPE_ORDER, TYPES } from "../models/types.js";
import { reportError } from "../services/actions.js";
import { emptyState, pageHeader } from "../ui/components.js";
import { confirmDialog, openModal } from "../ui/dialog.js";
import { h, icon, setChildren } from "../ui/dom.js";
import { itemCard } from "../ui/item-card.js";
import { toast } from "../ui/toast.js";

async function replaceTag(from, to) {
    const affected = store.all({ includeTrashed: true }).filter((item) => item.tags?.includes(from));
    for (const item of affected) {
        const tags = item.tags.filter((tag) => tag !== from);
        if (to && !tags.includes(to)) tags.push(to);
        await store.update(item.id, { tags });
    }
    return affected.length;
}

function renameDialog(tag, navigate) {
    let input;
    openModal({
        title: t("tags.renameTitle", { tag }),
        size: "sm",
        content: (close) =>
            h(
                "form",
                {
                    class: "stack",
                    onSubmit: async (event) => {
                        event.preventDefault();
                        const next = input.value.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase();
                        if (!next || next === tag) return close();
                        try {
                            const count = await replaceTag(tag, next);
                            toast.success(t("tags.renamed", { count }));
                            close();
                            navigate(`/tags/${encodeURIComponent(next)}`, { replace: true });
                        } catch (error) {
                            reportError(error);
                        }
                    },
                },
                h("label", { class: "field" }, h("span", { class: "field__label" }, t("tags.newName")), h("input", { class: "input", value: tag, required: true, ref: (el) => (input = el) })),
                h("p", { class: "field__hint" }, t("tags.mergeHint")),
                h("div", { class: "modal__actions" }, h("button", { type: "button", class: "btn btn--ghost", onClick: () => close() }, t("common.cancel")), h("button", { type: "submit", class: "btn btn--primary" }, t("common.save")))
            ),
    });
    setTimeout(() => input?.select(), 50);
}

export function tagsView({ params, navigate }) {
    const root = h("div", { class: "tags-page" });
    const tag = params.tag ? params.tag.toLowerCase() : null;

    const render = () => {
        if (!tag) {
            const tags = store.tags();
            const max = Math.max(1, ...tags.map(([, count]) => count));
            setChildren(root, 
                pageHeader({ title: t("nav.tags"), subtitle: t("tags.subtitle"), iconName: "fa-tags" }),
                tags.length
                    ? h(
                          "div",
                          { class: "tag-cloud panel" },
                          tags.map(([name, count]) =>
                              h("a", { class: "tag tag--cloud", href: `/tags/${encodeURIComponent(name)}`, style: { "--weight": String(0.85 + (count / max) * 0.65) } }, `#${name}`, h("span", { class: "tag__count" }, count))
                          )
                      )
                    : emptyState({ iconName: "fa-tags", title: t("tags.emptyTitle"), text: t("tags.emptyText") })
            );
            return;
        }

        const items = store.all().filter((item) => item.tags?.includes(tag));
        setChildren(root, 
            pageHeader({
                title: `#${tag}`,
                subtitle: t("common.itemsCount", { count: items.length }),
                iconName: "fa-hashtag",
                actions: [
                    h("a", { class: "btn btn--ghost", href: "/tags" }, icon("fa-arrow-left"), ` ${t("tags.all")}`),
                    h("button", { type: "button", class: "btn btn--ghost", onClick: () => renameDialog(tag, navigate) }, icon("fa-pen"), ` ${t("tags.rename")}`),
                    h(
                        "button",
                        {
                            type: "button",
                            class: "btn btn--ghost",
                            onClick: async () => {
                                if (!(await confirmDialog({ title: t("tags.deleteTitle"), message: t("tags.deleteConfirm", { tag }), confirmText: t("tags.remove"), danger: true }))) return;
                                try {
                                    const count = await replaceTag(tag, null);
                                    toast.success(t("tags.removed", { count }));
                                    navigate("/tags", { replace: true });
                                } catch (error) {
                                    reportError(error);
                                }
                            },
                        },
                        icon("fa-trash-can"),
                        ` ${t("common.delete")}`
                    ),
                ],
            }),
            items.length
                ? TYPE_ORDER.map((key) => {
                      const group = items.filter((item) => item.type === key);
                      return group.length
                          ? h(
                                "section",
                                { class: "task-group" },
                                h("h2", { class: "task-group__title" }, icon(TYPES[key].icon), ` ${TYPES[key].plural}`, h("span", { class: "task-group__count" }, group.length)),
                                h("div", { class: "card-list" }, group.map((item) => itemCard(item)))
                            )
                          : null;
                  })
                : emptyState({ iconName: "fa-hashtag", title: t("tags.noItems") })
        );
    };

    render();
    return { title: tag ? `#${tag}` : t("nav.tags"), el: root, cleanup: store.subscribe(render) };
}
