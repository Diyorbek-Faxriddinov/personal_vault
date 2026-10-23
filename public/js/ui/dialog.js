/**
 * Modal oynalar (<dialog> asosida): tasdiqlash, parol so'rash, tiklash kalitini ko'rsatish.
 */
import { locale, t } from "../core/i18n.js";
import { copyToClipboard, downloadFile, h, icon } from "./dom.js";
import { toast } from "./toast.js";

/** Umumiy modal. content — Node yoki (close) => Node. @returns {{ close, dialog, closed: Promise }} */
export function openModal({ title, content, size = "md", onClose, dismissible = true }) {
    let resolveClosed;
    const closed = new Promise((resolve) => (resolveClosed = resolve));
    const dialog = h("dialog", { class: `modal modal--${size}`, "aria-label": title });

    const close = (value) => {
        if (dialog.open) dialog.close();
        dialog.remove();
        onClose?.(value);
        resolveClosed(value);
    };

    dialog.append(
        h(
            "div",
            { class: "modal__inner" },
            h(
                "header",
                { class: "modal__header" },
                h("h2", { class: "modal__title" }, title),
                dismissible && h("button", { type: "button", class: "icon-btn icon-btn--ghost", "aria-label": t("common.close"), onClick: () => close(null) }, icon("fa-xmark"))
            ),
            h("div", { class: "modal__body" }, typeof content === "function" ? content(close) : content)
        )
    );

    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        if (dismissible) close(null);
    });
    dialog.addEventListener("click", (event) => {
        if (dismissible && event.target === dialog) close(null);
    });

    document.body.append(dialog);
    dialog.showModal();
    return { close, dialog, closed };
}

export function confirmDialog({ title = t("dialog.confirmTitle"), message, confirmText = t("common.yes"), cancelText = t("common.cancel"), danger = false }) {
    const modal = openModal({
        title,
        size: "sm",
        content: (close) =>
            h(
                "div",
                { class: "stack" },
                message && h("p", { class: "text-muted" }, message),
                h(
                    "div",
                    { class: "modal__actions" },
                    h("button", { type: "button", class: "btn btn--ghost", autofocus: true, onClick: () => close(false) }, cancelText),
                    h("button", { type: "button", class: `btn ${danger ? "btn--danger" : "btn--primary"}`, onClick: () => close(true) }, confirmText)
                )
            ),
    });
    return modal.closed.then(Boolean);
}

/**
 * Master parolni so'raydi va action(parol) ni bajaradi. Xato bo'lsa — oyna ichida ko'rsatadi.
 * @returns {Promise<any>} action natijasi yoki bekor qilinsa null
 */
export function passwordDialog({ title, message, confirmText = t("common.confirm"), danger = false, action }) {
    let input;
    let error;
    let button;
    const modal = openModal({
        title,
        size: "sm",
        content: (close) =>
            h(
                "form",
                {
                    class: "stack",
                    onSubmit: async (event) => {
                        event.preventDefault();
                        if (!input.value) return input.focus();
                        button.disabled = true;
                        button.classList.add("btn--loading");
                        error.textContent = "";
                        try {
                            close(await action(input.value));
                        } catch (err) {
                            error.textContent = err.message;
                            input.select();
                            button.disabled = false;
                            button.classList.remove("btn--loading");
                        }
                    },
                },
                message && h("p", { class: "text-muted" }, message),
                h(
                    "label",
                    { class: "field" },
                    h("span", { class: "field__label" }, t("auth.currentPassword")),
                    h("input", { class: "input", type: "password", autocomplete: "current-password", required: true, ref: (el) => (input = el) })
                ),
                h("p", { class: "field__error", role: "alert", ref: (el) => (error = el) }),
                h(
                    "div",
                    { class: "modal__actions" },
                    h("button", { type: "button", class: "btn btn--ghost", onClick: () => close(null) }, t("common.cancel")),
                    h("button", { type: "submit", class: `btn ${danger ? "btn--danger" : "btn--primary"}`, ref: (el) => (button = el) }, confirmText)
                )
            ),
    });
    setTimeout(() => input.focus(), 50);
    return modal.closed;
}

/** Tiklash kalitini bir marta ko'rsatadi; foydalanuvchi saqlaganini tasdiqlamaguncha yopilmaydi */
export function recoveryKeyDialog(recoveryKey, { email } = {}) {
    let checkbox;
    let done;
    const modal = openModal({
        title: t("recovery.title"),
        size: "md",
        dismissible: false,
        content: (close) =>
            h(
                "div",
                { class: "stack" },
                h(
                    "div",
                    { class: "callout callout--warning" },
                    icon("fa-triangle-exclamation"),
                    h(
                        "div",
                        {},
                        h("strong", {}, `${t("recovery.onlyNow")} `),
                        t("recovery.warning")
                    )
                ),
                h("code", { class: "recovery-key", tabIndex: 0 }, recoveryKey),
                h(
                    "div",
                    { class: "cluster" },
                    h(
                        "button",
                        {
                            type: "button",
                            class: "btn btn--ghost",
                            onClick: async () => {
                                if (await copyToClipboard(recoveryKey)) toast.success(t("common.copied"));
                            },
                        },
                        icon("fa-copy"),
                        ` ${t("common.copy")}`
                    ),
                    h(
                        "button",
                        {
                            type: "button",
                            class: "btn btn--ghost",
                            onClick: () =>
                                downloadFile({
                                    filename: `${t("recovery.file.name")}.txt`,
                                    mime: "text/plain",
                                    content: [
                                        `${t("app.name")} — ${t("recovery.file.heading")}`,
                                        ...(email ? [t("recovery.file.account", { email })] : []),
                                        t("recovery.file.date", { date: new Date().toLocaleString(locale()) }),
                                        "",
                                        recoveryKey,
                                        "",
                                        t("recovery.file.hint"),
                                        "",
                                    ].join("\n"),
                                }),
                        },
                        icon("fa-download"),
                        ` ${t("recovery.download")}`
                    )
                ),
                h(
                    "label",
                    { class: "checkbox" },
                    h("input", {
                        type: "checkbox",
                        ref: (el) => (checkbox = el),
                        onChange: () => (done.disabled = !checkbox.checked),
                    }),
                    h("span", {}, t("recovery.saved"))
                ),
                h(
                    "div",
                    { class: "modal__actions" },
                    h("button", { type: "button", class: "btn btn--primary", disabled: true, ref: (el) => (done = el), onClick: () => close(true) }, t("common.continue"))
                )
            ),
    });
    return modal.closed;
}
