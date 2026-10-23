/**
 * Kirish ekranlari: kirish, ro'yxatdan o'tish, qulfni ochish, parolni tiklash.
 */
import { t } from "../core/i18n.js";
import { auth } from "../services/auth.js";
import { recoveryKeyDialog } from "../ui/dialog.js";
import { h, icon } from "../ui/dom.js";
import { languageSelect } from "../ui/language.js";
import { passwordStrength } from "../ui/password-tools.js";

const MIN_PASSWORD = 10;

function layout({ title, subtitle, iconName = "fa-vault", body, footer }) {
    return h(
        "div",
        { class: "auth" },
        h(
            "div",
            { class: "auth__card" },
            h(
                "header",
                { class: "auth__header" },
                h("div", { class: "auth__logo" }, icon(iconName)),
                h("h1", { class: "auth__title" }, title),
                subtitle && h("p", { class: "auth__subtitle" }, subtitle)
            ),
            body,
            footer && h("footer", { class: "auth__footer" }, footer)
        ),
        h("p", { class: "auth__note" }, icon("fa-shield-halved"), ` ${t("auth.note")}`),
        h("label", { class: "auth__lang" }, icon("fa-globe"), h("span", { class: "visually-hidden" }, t("settings.language")), languageSelect({ className: "select--sm" }))
    );
}

function passwordInput({ name, label, autocomplete, withMeter = false }) {
    const input = h("input", { class: "input", type: "password", name, id: `auth-${name}`, autocomplete, required: true, spellcheck: "false" });
    const toggle = h(
        "button",
        {
            type: "button",
            class: "icon-btn icon-btn--ghost",
            "aria-label": t("password.show"),
            onClick: () => {
                const show = input.type === "password";
                input.type = show ? "text" : "password";
                toggle.replaceChildren(icon(show ? "fa-eye-slash" : "fa-eye"));
                toggle.setAttribute("aria-label", show ? t("password.hide") : t("password.show"));
            },
        },
        icon("fa-eye")
    );
    const meter = withMeter && h("div", { class: "strength", dataset: { score: "0" } }, h("div", { class: "strength__bar" }), h("span", { class: "strength__label" }));
    if (meter) {
        input.addEventListener("input", () => {
            const { score, label } = passwordStrength(input.value);
            meter.dataset.score = input.value ? String(score + 1) : "0";
            meter.querySelector(".strength__label").textContent = input.value ? label : "";
        });
    }
    return {
        input,
        el: h("div", { class: "field" }, h("label", { class: "field__label", for: input.id }, label), h("div", { class: "input-group" }, input, toggle), meter),
    };
}

function textInput({ name, label, type = "text", autocomplete, value = "", placeholder }) {
    const input = h("input", { class: "input", type, name, id: `auth-${name}`, autocomplete, required: true, value, placeholder, spellcheck: "false" });
    return { input, el: h("div", { class: "field" }, h("label", { class: "field__label", for: input.id }, label), input) };
}

/** Forma yuborilishini boshqaradi: tugmada yuklanish, xatoni ko'rsatish */
function authForm(children, submitLabel, onSubmit) {
    const error = h("div", { class: "callout callout--danger", role: "alert", hidden: true });
    const button = h("button", { type: "submit", class: "btn btn--primary btn--block btn--lg" }, submitLabel);
    const form = h("form", { class: "stack", novalidate: true }, children, error, button);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.hidden = true;
        button.disabled = true;
        button.classList.add("btn--loading");
        try {
            await onSubmit((message) => {
                throw new Error(message);
            });
        } catch (err) {
            error.replaceChildren(icon("fa-circle-exclamation"), h("span", {}, err.message));
            error.hidden = false;
        } finally {
            button.disabled = false;
            button.classList.remove("btn--loading");
        }
    });
    return form;
}

function validateNewPassword(password, confirm, fail) {
    if (password.length < MIN_PASSWORD) fail(t("auth.passwordTooShort", { count: MIN_PASSWORD }));
    if (passwordStrength(password).score < 2) fail(t("auth.passwordTooWeak"));
    if (password !== confirm) fail(t("auth.passwordMismatch"));
}

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// ─── Kirish ───────────────────────────────────────────────────────

export function loginView() {
    const email = textInput({ name: "email", label: t("auth.email"), type: "email", autocomplete: "username", placeholder: t("auth.emailPlaceholder") });
    const password = passwordInput({ name: "password", label: t("auth.masterPassword"), autocomplete: "current-password" });

    const form = authForm([email.el, password.el], t("auth.signIn"), async (fail) => {
        if (!isEmail(email.input.value.trim())) fail(t("auth.invalidEmail"));
        if (!password.input.value) fail(t("auth.enterPassword"));
        await auth.login(email.input.value.trim(), password.input.value);
    });

    setTimeout(() => email.input.focus());
    return {
        title: t("auth.signIn"),
        el: layout({
            title: t("auth.welcome"),
            subtitle: t("auth.loginSubtitle"),
            body: form,
            footer: [
                h("p", {}, `${t("auth.noAccount")} `, h("a", { href: "/register" }, t("auth.register"))),
                h("p", {}, h("a", { href: "/recover" }, t("auth.forgot"))),
            ],
        }),
    };
}

// ─── Ro'yxatdan o'tish ────────────────────────────────────────────

export function registerView() {
    const email = textInput({ name: "email", label: t("auth.email"), type: "email", autocomplete: "username", placeholder: t("auth.emailPlaceholder") });
    const password = passwordInput({ name: "password", label: t("auth.masterPassword"), autocomplete: "new-password", withMeter: true });
    const confirm = passwordInput({ name: "confirm", label: t("auth.confirmPassword"), autocomplete: "new-password" });
    const agree = h("input", { type: "checkbox", required: true });

    const form = authForm(
        [
            email.el,
            password.el,
            h("p", { class: "field__hint" }, t("auth.passwordHint", { count: MIN_PASSWORD })),
            confirm.el,
            h(
                "div",
                { class: "callout callout--info" },
                icon("fa-circle-info"),
                h("span", {}, t("auth.registerInfo"))
            ),
            h("label", { class: "checkbox" }, agree, h("span", {}, t("auth.understand"))),
        ],
        t("auth.createAccount"),
        async (fail) => {
            const emailValue = email.input.value.trim();
            if (!isEmail(emailValue)) fail(t("auth.invalidEmail"));
            validateNewPassword(password.input.value, confirm.input.value, fail);
            if (!agree.checked) fail(t("auth.mustAgree"));
            const recoveryKey = await auth.register(emailValue, password.input.value);
            await recoveryKeyDialog(recoveryKey, { email: emailValue });
        }
    );

    setTimeout(() => email.input.focus());
    return {
        title: t("auth.registerTitle"),
        el: layout({
            title: t("auth.createVault"),
            subtitle: t("auth.registerSubtitle"),
            body: form,
            footer: h("p", {}, `${t("auth.haveAccount")} `, h("a", { href: "/login" }, t("auth.signIn"))),
        }),
    };
}

// ─── Qulfni ochish ────────────────────────────────────────────────

export function unlockView() {
    const password = passwordInput({ name: "password", label: t("auth.masterPassword"), autocomplete: "current-password" });
    const form = authForm([password.el], t("auth.unlock"), async (fail) => {
        if (!password.input.value) fail(t("auth.enterPassword"));
        await auth.unlock(password.input.value);
    });

    setTimeout(() => password.input.focus());
    return {
        title: t("auth.lockedTitle"),
        el: layout({
            title: t("auth.vaultLocked"),
            subtitle: auth.account?.user.email,
            iconName: "fa-lock",
            body: form,
            footer: h(
                "p",
                {},
                h("button", { type: "button", class: "link-btn", onClick: () => auth.logout() }, t("auth.otherAccount")),
                " · ",
                h("a", { href: "/recover", onClick: () => auth.forgetLocally() }, t("auth.forgotShort"))
            ),
        }),
    };
}

// ─── Parolni tiklash ──────────────────────────────────────────────

export function recoverView() {
    const email = textInput({ name: "email", label: t("auth.email"), type: "email", autocomplete: "username" });
    const key = textInput({ name: "recovery", label: t("auth.recoveryKey"), autocomplete: "off", placeholder: "XXXX-XXXX-XXXX-..." });
    key.input.classList.add("input--mono");
    const password = passwordInput({ name: "password", label: t("auth.newPassword"), autocomplete: "new-password", withMeter: true });
    const confirm = passwordInput({ name: "confirm", label: t("auth.confirmNewPassword"), autocomplete: "new-password" });

    const form = authForm([email.el, key.el, password.el, confirm.el], t("auth.recover"), async (fail) => {
        const emailValue = email.input.value.trim();
        if (!isEmail(emailValue)) fail(t("auth.invalidEmail"));
        if (!key.input.value.trim()) fail(t("auth.enterRecoveryKey"));
        validateNewPassword(password.input.value, confirm.input.value, fail);
        const newRecoveryKey = await auth.recover(emailValue, key.input.value, password.input.value);
        await recoveryKeyDialog(newRecoveryKey, { email: emailValue });
    });

    return {
        title: t("auth.recoverTitle"),
        el: layout({
            title: t("auth.recoverHeading"),
            subtitle: t("auth.recoverSubtitle"),
            iconName: "fa-key",
            body: h(
                "div",
                { class: "stack" },
                h(
                    "div",
                    { class: "callout callout--warning" },
                    icon("fa-triangle-exclamation"),
                    h("span", {}, t("auth.recoverWarning"))
                ),
                form
            ),
            footer: h("p", {}, h("a", { href: "/login" }, t("auth.backToLogin"))),
        }),
    };
}
