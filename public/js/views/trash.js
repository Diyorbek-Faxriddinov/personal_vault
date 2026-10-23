/**
 * Savat: o'chirilgan yozuvlarni tiklash yoki butunlay o'chirish.
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { purgeItem, reportError, restoreItem } from "../services/actions.js";
import { emptyState, pageHeader } from "../ui/components.js";
import { confirmDialog } from "../ui/dialog.js";
import { h, icon, setChildren } from "../ui/dom.js";
import { relativeTime } from "../ui/format.js";
import { itemCard } from "../ui/item-card.js";
import { toast } from "../ui/toast.js";

export function trashView() {
    const root = h("div");

    const render = () => {
        const items = store.trashed().sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
        setChildren(root, 
            pageHeader({
                title: t("nav.trash"),
                subtitle: t("trash.subtitle"),
                iconName: "fa-trash-can",
                actions: items.length
                    ? [
                          h(
                              "button",
                              {
                                  type: "button",
                                  class: "btn btn--danger",
                                  onClick: async () => {
                                      const ok = await confirmDialog({
                                          title: t("trash.empty"),
                                          message: t("trash.emptyConfirm", { count: items.length }),
                                          confirmText: t("trash.purge"),
                                          danger: true,
                                      });
                                      if (!ok) return;
                                      try {
                                          toast.success(t("trash.purged", { count: await store.emptyTrash() }));
                                      } catch (error) {
                                          reportError(error);
                                      }
                                  },
                              },
                              icon("fa-dumpster"),
                              ` ${t("trash.empty")}`
                          ),
                      ]
                    : [],
            }),
            items.length
                ? h(
                      "div",
                      { class: "card-list" },
                      items.map((item) =>
                          itemCard(item, {
                              showType: true,
                              trailing: [
                                  h("span", { class: "text-muted text-sm hide-sm" }, relativeTime(item.trashedAt)),
                                  h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => restoreItem(item) }, icon("fa-rotate-left"), ` ${t("common.restore")}`),
                                  h(
                                      "button",
                                      {
                                          type: "button",
                                          class: "icon-btn icon-btn--ghost icon-btn--sm",
                                          title: t("trash.purge"),
                                          "aria-label": t("trash.purge"),
                                          onClick: async () => {
                                              if (await confirmDialog({ title: t("trash.purge"), message: t("trash.purgeOne"), confirmText: t("common.delete"), danger: true })) purgeItem(item);
                                          },
                                      },
                                      icon("fa-xmark")
                                  ),
                              ],
                          })
                      )
                  )
                : emptyState({ iconName: "fa-trash-can", title: t("trash.emptyTitle"), text: t("trash.emptyText") })
        );
    };

    render();
    return { title: t("nav.trash"), el: root, cleanup: store.subscribe(render) };
}
