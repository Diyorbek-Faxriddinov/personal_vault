/**
 * Toast bildirishnomalar. action — masalan "Bekor qilish" (undo) tugmasi.
 */
import { t } from "../core/i18n.js";
import { h, icon } from "./dom.js";

const ICONS = {
    success: "fa-circle-check",
    error: "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info",
};

let container = null;

function getContainer() {
    if (!container) {
        container = h("div", { class: "toast-container", role: "status", "aria-live": "polite" });
        document.body.append(container);
    }
    return container;
}

export function toast(message, { type = "info", duration = 4000, action } = {}) {
    let timer;
    const dismiss = () => {
        clearTimeout(timer);
        el.classList.add("toast--hide");
        setTimeout(() => el.remove(), 200);
    };

    const el = h(
        "div",
        { class: `toast toast--${type}` },
        icon(ICONS[type] ?? ICONS.info, "toast__icon"),
        h("span", { class: "toast__message" }, message),
        action &&
            h(
                "button",
                {
                    type: "button",
                    class: "toast__action",
                    onClick: () => {
                        dismiss();
                        action.onClick();
                    },
                },
                action.label
            ),
        h("button", { type: "button", class: "toast__close", "aria-label": t("common.close"), onClick: dismiss }, icon("fa-xmark"))
    );

    const host = getContainer();
    host.append(el);
    // Bir vaqtda ko'pi bilan 3 ta bildirishnoma — eskisi o'rnini bo'shatadi
    const visible = [...host.children].filter((node) => !node.classList.contains("toast--hide"));
    if (visible.length > 3) visible[0].querySelector(".toast__close").click();
    timer = setTimeout(dismiss, duration);
    return dismiss;
}

toast.success = (message, options) => toast(message, { ...options, type: "success" });
toast.error = (message, options) => toast(message, { duration: 6000, ...options, type: "error" });
toast.warning = (message, options) => toast(message, { ...options, type: "warning" });
toast.info = (message, options) => toast(message, { ...options, type: "info" });
