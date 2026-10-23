/**
 * Sozlamalar: profil, ko'rinish, xavfsizlik, sessiyalar, faollik jurnali, zaxira nusxa, AI, hisobni o'chirish.
 */
import { api } from "../core/api.js";
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { auth } from "../services/auth.js";
import { CONTEXT_SECTIONS } from "../services/ai.js";
import { reportError } from "../services/actions.js";
import { exportEncrypted, exportMarkdown, exportPlainJSON, importBackup, parseBackup } from "../services/backup.js";
import { settings } from "../services/settings.js";
import { auditLabel } from "../ui/audit.js";
import { pageHeader, section, spinner } from "../ui/components.js";
import { confirmDialog, passwordDialog, recoveryKeyDialog } from "../ui/dialog.js";
import { downloadFile, h, icon, setChildren } from "../ui/dom.js";
import { describeUserAgent, formatDateTime, relativeTime } from "../ui/format.js";
import { languageSelect } from "../ui/language.js";
import { passwordStrength } from "../ui/password-tools.js";
import { toast } from "../ui/toast.js";

const row = (label, control, hint) =>
    h("div", { class: "setting" }, h("div", { class: "setting__text" }, h("span", { class: "setting__label" }, label), hint && h("span", { class: "setting__hint" }, hint)), h("div", { class: "setting__control" }, control));

async function saveSetting(patch, message = t("common.saved")) {
    try {
        await settings.update(patch);
        toast.success(message);
    } catch (error) {
        reportError(error);
    }
}

// ─── Bo'limlar ────────────────────────────────────────────────────

function profileSection() {
    const current = settings.get();
    const name = h("input", { class: "input", value: current.displayName, maxlength: 60, placeholder: t("settings.namePlaceholder") });
    return section({
        title: t("settings.profile"),
        iconName: "fa-user",
        children: [
            row(t("auth.email"), h("span", { class: "text-muted" }, auth.account.user.email)),
            row(
                t("settings.name"),
                h(
                    "form",
                    {
                        class: "inline-form",
                        onSubmit: (event) => {
                            event.preventDefault();
                            saveSetting({ displayName: name.value.trim() });
                        },
                    },
                    name,
                    h("button", { type: "submit", class: "btn btn--ghost" }, t("common.save"))
                ),
                t("settings.nameHint")
            ),
            row(t("settings.createdAt"), h("span", { class: "text-muted" }, formatDateTime(auth.account.user.createdAt))),
        ],
    });
}

function appearanceSection() {
    const current = settings.get();
    const select = h(
        "select",
        { class: "input select", onChange: (event) => saveSetting({ theme: event.target.value }, t("settings.themeChanged")) },
        [
            ["system", t("theme.system")],
            ["light", t("theme.lightOption")],
            ["dark", t("theme.darkOption")],
        ].map(([value, label]) => h("option", { value, selected: current.theme === value }, label))
    );
    // Til shu qurilmada saqlanadi; tanlangach sahifa darhol yangi tilda qayta chiziladi
    const language = languageSelect({ onChange: () => toast.success(t("settings.languageChanged")) });
    return section({
        title: t("settings.appearance"),
        iconName: "fa-palette",
        children: [row(t("settings.language"), language, t("settings.languageHint")), row(t("settings.theme"), select)],
    });
}

function securitySection() {
    const current = settings.get();
    const autoLock = h(
        "select",
        { class: "input select", onChange: (event) => saveSetting({ autoLockMinutes: Number(event.target.value) }) },
        [
            [5, t("settings.minutes", { count: 5 })],
            [15, t("settings.minutes", { count: 15 })],
            [30, t("settings.minutes", { count: 30 })],
            [60, t("settings.hours", { count: 1 })],
            [240, t("settings.hours", { count: 4 })],
            [0, t("settings.never")],
        ].map(([value, label]) => h("option", { value, selected: current.autoLockMinutes === value }, label))
    );

    // Master parolni almashtirish
    const currentPw = h("input", { class: "input", type: "password", autocomplete: "current-password", required: true });
    const nextPw = h("input", { class: "input", type: "password", autocomplete: "new-password", required: true });
    const confirmPw = h("input", { class: "input", type: "password", autocomplete: "new-password", required: true });
    const meter = h("div", { class: "strength", dataset: { score: "0" } }, h("div", { class: "strength__bar" }), h("span", { class: "strength__label" }));
    nextPw.addEventListener("input", () => {
        const { score, label } = passwordStrength(nextPw.value);
        meter.dataset.score = nextPw.value ? String(score + 1) : "0";
        meter.querySelector(".strength__label").textContent = nextPw.value ? label : "";
    });
    const pwError = h("p", { class: "field__error", role: "alert" });
    const pwButton = h("button", { type: "submit", class: "btn btn--primary" }, t("settings.changePassword"));

    const passwordForm = h(
        "form",
        {
            class: "stack stack--sm",
            onSubmit: async (event) => {
                event.preventDefault();
                pwError.textContent = "";
                if (nextPw.value.length < 10) return (pwError.textContent = t("settings.pwTooShort", { count: 10 }));
                if (passwordStrength(nextPw.value).score < 2) return (pwError.textContent = t("settings.pwTooWeak"));
                if (nextPw.value !== confirmPw.value) return (pwError.textContent = t("settings.pwMismatch"));
                pwButton.disabled = true;
                pwButton.classList.add("btn--loading");
                try {
                    await auth.changePassword(currentPw.value, nextPw.value);
                    passwordForm.reset();
                    meter.dataset.score = "0";
                    toast.success(t("settings.pwChanged"));
                } catch (error) {
                    pwError.textContent = error.message;
                } finally {
                    pwButton.disabled = false;
                    pwButton.classList.remove("btn--loading");
                }
            },
        },
        h("label", { class: "field" }, h("span", { class: "field__label" }, t("auth.currentPassword")), currentPw),
        h("div", { class: "field-row" }, h("label", { class: "field" }, h("span", { class: "field__label" }, t("auth.newPassword")), nextPw, meter), h("label", { class: "field" }, h("span", { class: "field__label" }, t("settings.confirmNew")), confirmPw)),
        pwError,
        h("div", {}, pwButton)
    );

    return section({
        title: t("settings.security"),
        iconName: "fa-shield-halved",
        children: [
            row(t("settings.autoLock"), autoLock, t("settings.autoLockHint")),
            row(
                t("auth.recoveryKey"),
                h(
                    "button",
                    {
                        type: "button",
                        class: "btn btn--ghost",
                        onClick: async () => {
                            const key = await passwordDialog({
                                title: t("settings.newRecoveryTitle"),
                                message: t("settings.newRecoveryText"),
                                confirmText: t("settings.newRecoveryButton"),
                                action: (password) => auth.rotateRecoveryKey(password),
                            });
                            if (key) await recoveryKeyDialog(key, { email: auth.account.user.email });
                        },
                    },
                    icon("fa-rotate"),
                    ` ${t("settings.newRecoveryButton")}`
                ),
                t("settings.recoveryHint")
            ),
            h("div", { class: "setting setting--block" }, h("span", { class: "setting__label" }, t("settings.changePassword")), h("span", { class: "setting__hint" }, t("settings.changePasswordHint")), passwordForm),
        ],
    });
}

function sessionsSection() {
    const host = h("div", {}, spinner());

    const load = async () => {
        try {
            const { sessions } = await api.get("/account/sessions");
            setChildren(host, 
                h(
                    "ul",
                    { class: "session-list" },
                    sessions.map((session) =>
                        h(
                            "li",
                            { class: "session" },
                            icon(/Android|iPhone|iPad/.test(session.userAgent ?? "") ? "fa-mobile-screen" : "fa-desktop", "session__icon"),
                            h(
                                "div",
                                { class: "session__text" },
                                h("strong", {}, describeUserAgent(session.userAgent ?? ""), session.current && h("span", { class: "badge badge--success" }, t("settings.currentSession"))),
                                h("span", { class: "text-muted text-sm" }, t("settings.sessionMeta", { ip: session.ip ?? t("settings.unknownIp"), active: relativeTime(session.lastSeenAt), created: formatDateTime(session.createdAt) }))
                            ),
                            !session.current &&
                                h(
                                    "button",
                                    {
                                        type: "button",
                                        class: "btn btn--ghost btn--sm",
                                        onClick: async () => {
                                            try {
                                                await api.delete(`/account/sessions/${session.id}`);
                                                toast.success(t("settings.sessionClosed"));
                                                load();
                                            } catch (error) {
                                                reportError(error);
                                            }
                                        },
                                    },
                                    t("settings.signOutSession")
                                )
                        )
                    )
                ),
                sessions.length > 1 &&
                    h(
                        "button",
                        {
                            type: "button",
                            class: "btn btn--ghost",
                            onClick: async () => {
                                try {
                                    const { revoked } = await api.delete("/account/sessions");
                                    toast.success(t("settings.signedOutDevices", { count: revoked }));
                                    load();
                                } catch (error) {
                                    reportError(error);
                                }
                            },
                        },
                        icon("fa-right-from-bracket"),
                        ` ${t("settings.signOutOthers")}`
                    )
            );
        } catch (error) {
            setChildren(host, h("p", { class: "field__error" }, error.message));
        }
    };
    load();
    return section({ title: t("settings.sessions"), iconName: "fa-laptop", children: host });
}

function activitySection() {
    const host = h("div", {}, spinner());
    api.get("/account/activity")
        .then(({ events }) =>
            setChildren(host, 
                h(
                    "ul",
                    { class: "activity" },
                    events.slice(0, 25).map((event) => {
                        const [iconName, label] = auditLabel(event.event);
                        const warn = event.event.endsWith("_failed");
                        return h(
                            "li",
                            { class: ["activity__item", warn && "activity__item--warn"] },
                            icon(iconName),
                            h("span", { class: "activity__label" }, label),
                            h("span", { class: "text-muted text-sm" }, `${formatDateTime(event.createdAt)} · ${event.ip ?? ""} · ${describeUserAgent(event.userAgent ?? "")}`)
                        );
                    })
                )
            )
        )
        .catch((error) => setChildren(host, h("p", { class: "field__error" }, error.message)));
    return section({ title: t("settings.activity"), iconName: "fa-clock-rotate-left", children: [h("p", { class: "text-muted text-sm" }, t("settings.activityHint")), host] });
}

function backupSection() {
    const last = settings.get().lastBackupAt;
    const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden" });
    const progress = h("p", { class: "text-muted text-sm", hidden: true });

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        try {
            const parsed = parseBackup(await file.text());
            const onProgress = (done, total) => {
                progress.hidden = false;
                progress.textContent = t("settings.importing", { done, total });
            };
            let summary;
            if (parsed.kind === "encrypted") {
                summary = await passwordDialog({
                    title: t("settings.importEncryptedTitle"),
                    message: t("settings.importEncryptedText", { count: parsed.data.count ?? parsed.data.items.length }),
                    confirmText: t("settings.import"),
                    action: (password) => importBackup(parsed, { password, onProgress }),
                });
            } else {
                const ok = await confirmDialog({ title: t("settings.importPlainTitle"), message: t("settings.importPlainText", { count: parsed.data.items.length }), confirmText: t("settings.import") });
                if (ok) summary = await importBackup(parsed, { onProgress });
            }
            if (summary) {
                toast.success(`${t("settings.importDone", { created: summary.created, restored: summary.restored, skipped: summary.skipped })}${summary.failed ? t("settings.importFailed", { count: summary.failed }) : ""}`, { duration: 8000 });
            }
        } catch (error) {
            reportError(error);
        } finally {
            progress.hidden = true;
        }
    });

    const exportButton = (label, iconName, factory, { warn } = {}) =>
        h(
            "button",
            {
                type: "button",
                class: "btn btn--ghost",
                onClick: async () => {
                    if (warn && !(await confirmDialog({ title: t("settings.unencryptedTitle"), message: warn, confirmText: t("settings.unencryptedConfirm"), danger: true }))) return;
                    try {
                        downloadFile(await factory());
                        toast.success(t("settings.downloaded"));
                    } catch (error) {
                        reportError(error);
                    }
                },
            },
            icon(iconName),
            ` ${label}`
        );

    return h(
        "div",
        { id: "backup" },
        section({
            title: t("settings.backup.title"),
            iconName: "fa-floppy-disk",
            children: [
                h("p", { class: "text-muted text-sm" }, last ? t("settings.lastBackup", { date: formatDateTime(last) }) : t("settings.noBackup"), ` ${t("settings.totalItems", { count: store.all({ includeTrashed: true }).length })}`),
                h(
                    "div",
                    { class: "cluster" },
                    exportButton(t("settings.exportEncrypted"), "fa-lock", exportEncrypted),
                    exportButton(t("settings.exportJson"), "fa-file-code", exportPlainJSON, { warn: t("settings.exportJsonWarn") }),
                    exportButton("Markdown", "fa-file-lines", exportMarkdown, { warn: t("settings.exportMdWarn") })
                ),
                h("div", { class: "cluster" }, h("button", { type: "button", class: "btn btn--ghost", onClick: () => fileInput.click() }, icon("fa-file-import"), ` ${t("settings.importButton")}`), fileInput),
                progress,
            ],
        })
    );
}

function aiSection() {
    const current = settings.get();
    const include = { ...current.aiInclude };
    return section({
        title: t("advisor.ai"),
        iconName: "fa-robot",
        children: [
            row(
                t("settings.aiUse"),
                h(
                    "label",
                    { class: "switch" },
                    h("input", { type: "checkbox", class: "switch__input", checked: current.aiEnabled, onChange: (event) => saveSetting({ aiEnabled: event.target.checked }) }),
                    h("span", { class: "switch__track", "aria-hidden": "true" })
                ),
                t("settings.aiUseHint")
            ),
            row(
                t("settings.aiSections"),
                h(
                    "div",
                    { class: "cluster" },
                    Object.entries(CONTEXT_SECTIONS).map(([key, label]) =>
                        h(
                            "label",
                            { class: "checkbox checkbox--chip" },
                            h("input", {
                                type: "checkbox",
                                checked: Boolean(include[key]),
                                onChange: (event) => {
                                    include[key] = event.target.checked;
                                    saveSetting({ aiInclude: { ...include } });
                                },
                            }),
                            h("span", {}, label)
                        )
                    )
                ),
                t("settings.aiSectionsHint")
            ),
        ],
    });
}

function dangerSection() {
    return section({
        title: t("settings.danger"),
        iconName: "fa-triangle-exclamation",
        className: "panel--danger",
        children: [
            row(
                t("settings.logout"),
                h("button", { type: "button", class: "btn btn--ghost", onClick: () => auth.logout() }, icon("fa-right-from-bracket"), ` ${t("settings.logoutButton")}`),
                t("settings.logoutHint")
            ),
            row(
                t("settings.deleteAccount"),
                h(
                    "button",
                    {
                        type: "button",
                        class: "btn btn--danger",
                        onClick: async () => {
                            const sure = await confirmDialog({
                                title: t("settings.deleteTitle"),
                                message: t("settings.deleteText"),
                                confirmText: t("common.continue"),
                                danger: true,
                            });
                            if (!sure) return;
                            const deleted = await passwordDialog({
                                title: t("common.confirm"),
                                message: t("settings.deletePassword"),
                                confirmText: t("settings.deleteAccount"),
                                danger: true,
                                action: async (password) => {
                                    await auth.deleteAccount(password);
                                    return true;
                                },
                            });
                            if (deleted) toast.info(t("settings.deleted"));
                        },
                    },
                    icon("fa-user-xmark"),
                    ` ${t("settings.deleteAccount")}`
                ),
                t("settings.irreversible")
            ),
        ],
    });
}

export function settingsView() {
    const el = h(
        "div",
        { class: "settings" },
        pageHeader({ title: t("nav.settings"), iconName: "fa-gear" }),
        profileSection(),
        appearanceSection(),
        securitySection(),
        sessionsSection(),
        activitySection(),
        backupSection(),
        aiSection(),
        dangerSection()
    );
    if (location.hash) setTimeout(() => el.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth" }), 50);
    return { title: t("nav.settings"), el };
}
