/**
 * Maslahatchi: 1) qoidalarga asoslangan maslahatlar (to'liq maxfiy, brauzerda),
 *              2) ixtiyoriy AI suhbat (foydalanuvchi roziligi bilan, tanlangan ma'lumotlar bilan).
 */
import { locale, t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { auth } from "../services/auth.js";
import { buildContext, CONTEXT_SECTIONS, getStatus, streamChat } from "../services/ai.js";
import { reportError } from "../services/actions.js";
import { generateInsights } from "../services/insights.js";
import { settings } from "../services/settings.js";
import { pageHeader, section, spinner } from "../ui/components.js";
import { openModal } from "../ui/dialog.js";
import { h, icon, setChildren } from "../ui/dom.js";
import { itemHref } from "../ui/item-card.js";
import { renderMarkdown } from "../ui/markdown.js";
import { toast } from "../ui/toast.js";
import { insightCard } from "./dashboard.js";

const suggestions = () => [1, 2, 3, 4].map((n) => t(`advisor.suggest.${n}`));

/** Suhbat faqat xotirada; vault qulflanganda o'chadi */
let conversation = [];
auth.subscribe((status) => {
    if (status !== "unlocked") conversation = [];
});

function aiPanel(navigate) {
    const host = h("div", { class: "ai" }, spinner());

    getStatus()
        .then((status) => {
            if (!status.enabled) {
                setChildren(host, 
                    h(
                        "div",
                        { class: "callout callout--info" },
                        icon("fa-circle-info"),
                        h(
                            "div",
                            {},
                            h("strong", {}, `${t("advisor.disabledTitle")} `),
                            t("advisor.disabledText")
                        )
                    )
                );
                return;
            }
            render();
        })
        .catch(() => setChildren(host, h("p", { class: "text-muted" }, t("advisor.statusFailed"))));

    function consentCard() {
        return h(
            "div",
            { class: "stack" },
            h(
                "div",
                { class: "callout callout--warning" },
                icon("fa-user-shield"),
                h(
                    "div",
                    {},
                    h("strong", {}, `${t("advisor.privacyTitle")} `),
                    t("advisor.privacyText")
                )
            ),
            h(
                "button",
                {
                    type: "button",
                    class: "btn btn--primary",
                    onClick: async () => {
                        try {
                            await settings.update({ aiEnabled: true });
                            render();
                        } catch (error) {
                            reportError(error);
                        }
                    },
                },
                icon("fa-check"),
                ` ${t("advisor.enable")}`
            )
        );
    }

    function render() {
        if (!settings.get().aiEnabled) {
            setChildren(host, consentCard());
            return;
        }

        const messagesEl = h("div", { class: "chat__messages", "aria-live": "polite" });
        const textarea = h("textarea", { class: "input textarea chat__input", rows: 2, placeholder: t("advisor.placeholder"), maxlength: 4000 });
        const sendButton = h("button", { type: "submit", class: "btn btn--primary" }, icon("fa-paper-plane"), ` ${t("advisor.send")}`);
        let controller = null;

        const include = { ...settings.get().aiInclude };
        const sectionToggles = h(
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
                            settings.update({ aiInclude: { ...include } }).catch(() => {});
                        },
                    }),
                    h("span", {}, label)
                )
            )
        );

        const context = () => buildContext(store.all(), include);

        const messageEl = (message) =>
            h(
                "div",
                { class: `chat__message chat__message--${message.role}` },
                h("span", { class: "chat__avatar" }, icon(message.role === "user" ? "fa-user" : "fa-robot")),
                h(
                    "div",
                    { class: "chat__bubble" },
                    message.role === "assistant" ? renderMarkdown(message.content || "…") : h("p", {}, message.content),
                    message.role === "assistant" &&
                        message.content &&
                        !message.streaming &&
                        h(
                            "div",
                            { class: "chat__tools" },
                            h(
                                "button",
                                {
                                    type: "button",
                                    class: "btn btn--ghost btn--xs",
                                    onClick: async () => {
                                        try {
                                            const note = await store.create("note", { title: t("advisor.noteTitle", { date: new Date().toLocaleDateString(locale()) }), body: message.content, tags: [t("advisor.noteTag")] });
                                            toast.success(t("advisor.savedAsNote"), { action: { label: t("common.open"), onClick: () => navigate(itemHref(note)) } });
                                        } catch (error) {
                                            reportError(error);
                                        }
                                    },
                                },
                                icon("fa-floppy-disk"),
                                ` ${t("advisor.saveAsNote")}`
                            )
                        )
                )
            );

        const renderMessages = () => {
            setChildren(messagesEl, 
                ...(conversation.length
                    ? conversation.map(messageEl)
                    : [
                          h(
                              "div",
                              { class: "chat__empty" },
                              h("p", { class: "text-muted" }, t("advisor.tryAsking")),
                              h(
                                  "div",
                                  { class: "chips chips--wrap" },
                                  suggestions().map((text) => h("button", { type: "button", class: "chip", onClick: () => send(text) }, text))
                              )
                          ),
                      ])
            );
            messagesEl.scrollTop = messagesEl.scrollHeight;
        };

        async function send(text) {
            const content = text.trim();
            if (!content || controller) return;
            textarea.value = "";
            conversation.push({ role: "user", content });
            const reply = { role: "assistant", content: "", streaming: true };
            conversation.push(reply);
            renderMessages();

            controller = new AbortController();
            sendButton.replaceChildren(icon("fa-stop"), ` ${t("advisor.stop")}`);
            sendButton.type = "button";
            sendButton.onclick = () => controller?.abort();

            const history = conversation.filter((m) => m !== reply && m.content).map(({ role, content: c }) => ({ role, content: c }));
            let pending = "";
            let frame = null;
            try {
                await streamChat(
                    { messages: history, context: context() },
                    {
                        signal: controller.signal,
                        onText: (chunk) => {
                            pending += chunk;
                            frame ??= requestAnimationFrame(() => {
                                reply.content += pending;
                                pending = "";
                                frame = null;
                                const last = messagesEl.lastElementChild;
                                last?.replaceWith(messageEl(reply));
                                messagesEl.scrollTop = messagesEl.scrollHeight;
                            });
                        },
                    }
                );
            } catch (error) {
                if (error.name !== "AbortError") {
                    reply.content ||= `⚠️ ${error.message}`;
                    toast.error(error.message);
                }
            } finally {
                if (frame) cancelAnimationFrame(frame);
                reply.content += pending;
                reply.streaming = false;
                if (!reply.content) conversation.splice(conversation.indexOf(reply), 1);
                controller = null;
                sendButton.replaceChildren(icon("fa-paper-plane"), ` ${t("advisor.send")}`);
                sendButton.type = "submit";
                sendButton.onclick = null;
                renderMessages();
                textarea.focus();
            }
        }

        textarea.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(textarea.value);
            }
        });

        setChildren(host, 
            h(
                "div",
                { class: "chat" },
                h(
                    "div",
                    { class: "chat__context" },
                    h("span", { class: "text-muted text-sm" }, icon("fa-database"), ` ${t("advisor.sections")}`),
                    sectionToggles,
                    h(
                        "button",
                        {
                            type: "button",
                            class: "btn btn--ghost btn--xs",
                            onClick: () =>
                                openModal({
                                    title: t("advisor.contextTitle"),
                                    size: "lg",
                                    content: h("div", { class: "stack" }, h("p", { class: "text-muted" }, t("advisor.contextText")), h("pre", { class: "context-preview" }, context())),
                                }),
                        },
                        icon("fa-eye"),
                        ` ${t("common.view")}`
                    ),
                    conversation.length > 0 &&
                        h(
                            "button",
                            {
                                type: "button",
                                class: "btn btn--ghost btn--xs",
                                onClick: () => {
                                    conversation = [];
                                    renderMessages();
                                },
                            },
                            icon("fa-broom"),
                            ` ${t("advisor.newChat")}`
                        )
                ),
                messagesEl,
                h(
                    "form",
                    {
                        class: "chat__form",
                        onSubmit: (event) => {
                            event.preventDefault();
                            send(textarea.value);
                        },
                    },
                    textarea,
                    sendButton
                )
            )
        );
        renderMessages();
    }

    return host;
}

export function advisorView({ navigate }) {
    const insightsHost = h("div", { class: "insight-list" });
    const renderInsights = () => {
        const insights = generateInsights(store.all({ includeTrashed: true }), { settings: settings.get() });
        setChildren(insightsHost, ...(insights.length ? insights.map(insightCard) : [h("p", { class: "text-muted" }, t("insight.none"))]));
    };
    renderInsights();

    const el = h(
        "div",
        { class: "advisor" },
        pageHeader({ title: t("nav.advisor"), subtitle: t("advisor.subtitle"), iconName: "fa-lightbulb" }),
        h(
            "div",
            { class: "advisor__grid" },
            section({
                title: t("advisor.auto"),
                iconName: "fa-wand-magic-sparkles",
                action: h("span", { class: "badge badge--success" }, icon("fa-lock"), ` ${t("advisor.private")}`),
                children: [h("p", { class: "text-muted text-sm" }, t("advisor.autoText")), insightsHost],
            }),
            section({ title: t("advisor.ai"), iconName: "fa-robot", className: "panel--chat", children: aiPanel(navigate) })
        )
    );

    return { title: t("nav.advisor"), el, cleanup: store.subscribe(renderInsights) };
}
