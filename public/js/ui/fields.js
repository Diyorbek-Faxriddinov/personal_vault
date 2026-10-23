/**
 * Tahrirlash formasi maydonlari. Har bir maydon turi (models/types.js dagi `type`) uchun:
 *   createField(field, value, ctx) → { el, get(), focus(), validate() → xato matni | "" }
 */
import { t } from "../core/i18n.js";
import { store } from "../core/store.js";
import { MOODS, newId } from "../models/types.js";
import { copyToClipboard, h, icon } from "./dom.js";
import { renderMarkdown } from "./markdown.js";
import { generatePassword, passwordStrength } from "./password-tools.js";
import { toast } from "./toast.js";

const URL_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+/i;

function wrap(field, control, { hint } = {}) {
    const error = h("p", { class: "field__error", role: "alert" });
    const el = h(
        "div",
        { class: ["field", field.half && "field--half", `field--${field.type}`] },
        h("label", { class: "field__label", for: `f-${field.key}` }, field.label, field.required && h("span", { class: "field__required", "aria-hidden": "true" }, " *")),
        control,
        hint && h("p", { class: "field__hint" }, hint),
        error
    );
    return { el, error };
}

function autoGrow(textarea) {
    const resize = () => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight + 2, 640)}px`;
    };
    textarea.addEventListener("input", resize);
    requestAnimationFrame(resize);
    return textarea;
}

// ─── Oddiy inputlar ───────────────────────────────────────────────

function inputField(field, value) {
    const typeMap = { text: "text", url: "url", number: "number", date: "date" };
    const input = h("input", {
        id: `f-${field.key}`,
        class: "input",
        type: typeMap[field.type],
        value: value ?? "",
        placeholder: field.placeholder,
        maxlength: field.maxLength,
        min: field.min,
        step: field.step,
        autocomplete: field.autocomplete ?? (field.type === "text" ? "off" : undefined),
        spellcheck: field.type === "url" ? "false" : undefined,
    });

    const control = field.copyable
        ? h(
              "div",
              { class: "input-group" },
              input,
              h("button", { type: "button", class: "icon-btn icon-btn--ghost", title: t("common.copy"), "aria-label": t("common.copy"), onClick: () => copyValue(input.value) }, icon("fa-copy"))
          )
        : input;
    const { el, error } = wrap(field, control);

    return {
        el,
        focus: () => input.focus(),
        get() {
            const raw = input.value.trim();
            if (field.type === "number") return raw === "" ? 0 : Number(raw);
            if (field.type === "date") return raw || null;
            return raw;
        },
        validate() {
            const raw = input.value.trim();
            let message = "";
            if (field.required && !raw) message = t("field.required", { label: field.label });
            else if (field.type === "url" && raw && !URL_PATTERN.test(raw)) message = t("field.urlInvalid");
            else if (field.type === "number" && raw && (Number.isNaN(Number(raw)) || Number(raw) < (field.min ?? -Infinity))) message = t("field.numberInvalid");
            error.textContent = message;
            input.setAttribute("aria-invalid", String(Boolean(message)));
            return message;
        },
    };
}

async function copyValue(text) {
    if (!text) return;
    if (await copyToClipboard(text)) toast.success(t("common.copied"));
}

function textareaField(field, value) {
    const textarea = autoGrow(h("textarea", { id: `f-${field.key}`, class: "input textarea", rows: 3, placeholder: field.placeholder, value: value ?? "" }));
    const { el, error } = wrap(field, textarea);
    return {
        el,
        focus: () => textarea.focus(),
        get: () => textarea.value.trim(),
        validate() {
            const message = field.required && !textarea.value.trim() ? t("field.required", { label: field.label }) : "";
            error.textContent = message;
            return message;
        },
    };
}

// ─── Markdown (yozish / ko'rish) ──────────────────────────────────

function markdownField(field, value) {
    const textarea = autoGrow(
        h("textarea", { id: `f-${field.key}`, class: "input textarea textarea--markdown", rows: 6, placeholder: field.placeholder, value: value ?? "" })
    );
    const preview = h("div", { class: "markdown-preview", hidden: true });
    let previewing = false;

    const surround = (before, after = before) => {
        const { selectionStart: start, selectionEnd: end, value: text } = textarea;
        const selected = text.slice(start, end) || t("md.sampleText");
        textarea.setRangeText(`${before}${selected}${after}`, start, end, "select");
        textarea.focus();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const linePrefix = (prefix) => {
        const { selectionStart: start, value: text } = textarea;
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        textarea.setRangeText(prefix, lineStart, lineStart, "end");
        textarea.focus();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    };

    textarea.addEventListener("keydown", (event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        if (event.key === "b") {
            event.preventDefault();
            surround("**");
        } else if (event.key === "i") {
            event.preventDefault();
            surround("*");
        }
    });

    const tool = (iconName, title, onClick) => h("button", { type: "button", class: "md-tool", title, "aria-label": title, onClick }, icon(iconName));
    const toggle = h(
        "button",
        {
            type: "button",
            class: "md-tool md-tool--toggle",
            onClick: () => {
                previewing = !previewing;
                preview.replaceChildren(renderMarkdown(textarea.value || `_${t("md.empty")}_`));
                preview.hidden = !previewing;
                textarea.hidden = previewing;
                toggle.replaceChildren(icon(previewing ? "fa-pen" : "fa-eye"), ` ${previewing ? t("common.edit") : t("md.preview")}`);
            },
        },
        icon("fa-eye"),
        ` ${t("md.preview")}`
    );

    const toolbar = h(
        "div",
        { class: "md-toolbar" },
        tool("fa-bold", t("md.bold"), () => surround("**")),
        tool("fa-italic", t("md.italic"), () => surround("*")),
        tool("fa-heading", t("md.heading"), () => linePrefix("## ")),
        tool("fa-list-ul", t("md.list"), () => linePrefix("- ")),
        tool("fa-square-check", t("md.task"), () => linePrefix("- [ ] ")),
        tool("fa-quote-left", t("md.quote"), () => linePrefix("> ")),
        tool("fa-code", t("md.code"), () => surround("`")),
        tool("fa-link", t("md.link"), () => surround("[", "](https://)")),
        h("span", { class: "md-toolbar__spacer" }),
        toggle
    );

    const { el } = wrap(field, h("div", { class: "md-editor" }, toolbar, textarea, preview));
    return { el, focus: () => textarea.focus(), get: () => textarea.value.replace(/\s+$/, ""), validate: () => "" };
}

// ─── Tanlov va belgilash ──────────────────────────────────────────

function selectField(field, value) {
    const select = h(
        "select",
        { id: `f-${field.key}`, class: "input select" },
        field.options.map((option) => h("option", { value: option.value, selected: String(option.value) === String(value) }, option.label))
    );
    const { el } = wrap(field, select);
    return { el, focus: () => select.focus(), get: () => select.value, validate: () => "" };
}

function checkboxField(field, value) {
    const input = h("input", { id: `f-${field.key}`, type: "checkbox", class: "switch__input", checked: Boolean(value) });
    const el = h(
        "div",
        { class: ["field", "field--checkbox", field.half && "field--half"] },
        h("label", { class: "switch" }, input, h("span", { class: "switch__track", "aria-hidden": "true" }), h("span", {}, field.label))
    );
    return { el, focus: () => input.focus(), get: () => input.checked, validate: () => "" };
}

function moodField(field, value) {
    let current = value ?? null;
    const buttons = MOODS.map((mood) =>
        h(
            "button",
            {
                type: "button",
                class: ["mood", current === mood.value && "is-active"],
                title: mood.label,
                "aria-label": mood.label,
                "aria-pressed": String(current === mood.value),
                onClick: () => {
                    current = current === mood.value ? null : mood.value;
                    buttons.forEach((button, i) => {
                        button.classList.toggle("is-active", MOODS[i].value === current);
                        button.setAttribute("aria-pressed", String(MOODS[i].value === current));
                    });
                },
            },
            mood.emoji
        )
    );
    const { el } = wrap(field, h("div", { class: "mood-picker", role: "group" }, buttons));
    return { el, focus: () => buttons[0].focus(), get: () => current, validate: () => "" };
}

function projectField(field, value) {
    const projects = store.byType("project").sort((a, b) => a.title.localeCompare(b.title));
    const options = [{ value: "", label: `— ${t("field.noProject")} —` }, ...projects.map((p) => ({ value: p.id, label: p.title }))];
    const base = selectField({ ...field, options }, value ?? "");
    return { ...base, get: () => base.get() || null };
}

// ─── Teglar ───────────────────────────────────────────────────────

const normalizeTag = (tag) =>
    tag
        .trim()
        .replace(/^#+/, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 40);

function tagsField(field, value) {
    const tags = [...(value ?? [])];
    const listId = `tags-suggest-${Math.random().toString(36).slice(2)}`;
    const chips = h("span", { class: "tag-input__chips" });
    const input = h("input", {
        id: `f-${field.key}`,
        class: "tag-input__input",
        placeholder: t("field.tags.placeholder"),
        list: listId,
        autocomplete: "off",
    });

    const render = () =>
        chips.replaceChildren(
            ...tags.map((tag, index) =>
                h(
                    "span",
                    { class: "tag tag--removable" },
                    `#${tag}`,
                    h(
                        "button",
                        {
                            type: "button",
                            "aria-label": t("field.tags.remove", { tag }),
                            onClick: () => {
                                tags.splice(index, 1);
                                render();
                            },
                        },
                        icon("fa-xmark")
                    )
                )
            )
        );

    const commit = () => {
        for (const part of input.value.split(",")) {
            const tag = normalizeTag(part);
            if (tag && !tags.includes(tag) && tags.length < 30) tags.push(tag);
        }
        input.value = "";
        render();
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
        } else if (event.key === "Backspace" && !input.value && tags.length) {
            tags.pop();
            render();
        }
    });
    input.addEventListener("blur", commit);
    input.addEventListener("change", () => {
        if (store.tags().some(([tag]) => tag === normalizeTag(input.value))) commit();
    });

    render();
    const datalist = h("datalist", { id: listId }, store.tags().map(([tag]) => h("option", { value: tag })));
    const { el } = wrap(field, h("div", { class: "tag-input", onClick: () => input.focus() }, chips, input, datalist));
    return {
        el,
        focus: () => input.focus(),
        // Yon ta'sirsiz: hali Enter bosilmagan matn ham teg sifatida hisoblanadi, lekin input tozalanmaydi
        get() {
            const pending = input.value.split(",").map(normalizeTag).filter((tag) => tag && !tags.includes(tag));
            return [...tags, ...new Set(pending)];
        },
        validate: () => "",
    };
}

// ─── Ro'yxat (kichik vazifalar, bosqichlar) ───────────────────────

function checklistField(field, value) {
    const entries = structuredClone(value ?? []);
    const list = h("ul", { class: "checklist" });
    const counter = h("span", { class: "checklist__counter" });
    const addInput = h("input", { class: "input input--sm", placeholder: field.placeholder ?? t("field.checklist.placeholder"), "aria-label": field.placeholder ?? t("field.checklist.placeholder") });

    const render = () => {
        const done = entries.filter((e) => e.done).length;
        counter.textContent = entries.length ? `${done}/${entries.length}` : "";
        list.replaceChildren(
            ...entries.map((entry, index) =>
                h(
                    "li",
                    { class: ["checklist__item", entry.done && "is-done"] },
                    h("input", {
                        type: "checkbox",
                        class: "checkbox__input",
                        checked: entry.done,
                        "aria-label": entry.text,
                        onChange: (event) => {
                            entry.done = event.target.checked;
                            render();
                        },
                    }),
                    h("input", {
                        class: "checklist__text",
                        value: entry.text,
                        "aria-label": t("field.checklist.text"),
                        onInput: (event) => (entry.text = event.target.value),
                        onKeydown: (event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addInput.focus();
                            }
                        },
                    }),
                    h(
                        "button",
                        { type: "button", class: "icon-btn icon-btn--ghost icon-btn--sm", "aria-label": t("field.checklist.up"), disabled: index === 0, onClick: () => move(index, -1) },
                        icon("fa-arrow-up")
                    ),
                    h(
                        "button",
                        {
                            type: "button",
                            class: "icon-btn icon-btn--ghost icon-btn--sm",
                            "aria-label": t("common.delete"),
                            onClick: () => {
                                entries.splice(index, 1);
                                render();
                            },
                        },
                        icon("fa-trash-can")
                    )
                )
            )
        );
    };
    const move = (index, delta) => {
        const [entry] = entries.splice(index, 1);
        entries.splice(index + delta, 0, entry);
        render();
    };
    const add = () => {
        const text = addInput.value.trim();
        if (!text) return;
        entries.push({ id: newId(), text, done: false });
        addInput.value = "";
        render();
    };
    addInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            add();
        }
    });

    render();
    const control = h(
        "div",
        { class: "checklist-editor" },
        list,
        h("div", { class: "checklist__add" }, addInput, h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: add }, icon("fa-plus"), ` ${t("common.add")}`), counter)
    );
    const { el } = wrap(field, control);
    let pendingId = newId();
    addInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") pendingId = newId();
    });
    return {
        el,
        focus: () => addInput.focus(),
        // Yon ta'sirsiz: "Qo'shish" bosilmagan matn ham saqlanadi
        get() {
            const saved = entries.filter((e) => e.text.trim()).map((e) => ({ ...e, text: e.text.trim() }));
            const pending = addInput.value.trim();
            return pending ? [...saved, { id: pendingId, text: pending, done: false }] : saved;
        },
        validate: () => "",
    };
}

// ─── Parol (ko'rsatish, nusxa, generator, kuch) ───────────────────

function passwordField(field, value) {
    const input = h("input", { id: `f-${field.key}`, class: "input input--mono", type: "password", value: value ?? "", autocomplete: "new-password", spellcheck: "false" });
    const meter = h("div", { class: "strength", dataset: { score: "0" } }, h("div", { class: "strength__bar" }), h("span", { class: "strength__label" }));
    const options = { length: 20, lower: true, upper: true, digits: true, symbols: true };

    const updateMeter = () => {
        const { score, label, bits } = passwordStrength(input.value);
        meter.dataset.score = input.value ? String(score + 1) : "0";
        meter.querySelector(".strength__label").textContent = input.value ? `${label} · ~${bits} bit` : "";
    };
    input.addEventListener("input", updateMeter);

    const reveal = h(
        "button",
        {
            type: "button",
            class: "icon-btn icon-btn--ghost",
            title: t("password.show"),
            "aria-label": t("password.show"),
            onClick: () => {
                const show = input.type === "password";
                input.type = show ? "text" : "password";
                reveal.replaceChildren(icon(show ? "fa-eye-slash" : "fa-eye"));
            },
        },
        icon("fa-eye")
    );

    const lengthLabel = h("span", {}, String(options.length));
    const generator = h(
        "div",
        { class: "generator", hidden: true },
        h(
            "label",
            { class: "generator__row" },
            `${t("password.length")} `,
            lengthLabel,
            h("input", {
                type: "range",
                min: 8,
                max: 64,
                value: options.length,
                onInput: (event) => {
                    options.length = Number(event.target.value);
                    lengthLabel.textContent = event.target.value;
                    regenerate();
                },
            })
        ),
        h(
            "div",
            { class: "cluster" },
            [
                ["upper", "A–Z"],
                ["lower", "a–z"],
                ["digits", "0–9"],
                ["symbols", "!@#"],
            ].map(([key, label]) =>
                h(
                    "label",
                    { class: "checkbox" },
                    h("input", {
                        type: "checkbox",
                        checked: options[key],
                        onChange: (event) => {
                            options[key] = event.target.checked;
                            regenerate();
                        },
                    }),
                    h("span", {}, label)
                )
            ),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => regenerate() }, icon("fa-rotate"), ` ${t("password.regenerate")}`)
        )
    );
    const regenerate = () => {
        input.value = generatePassword(options);
        input.type = "text";
        reveal.replaceChildren(icon("fa-eye-slash"));
        updateMeter();
    };

    const control = h(
        "div",
        { class: "stack stack--sm" },
        h(
            "div",
            { class: "input-group" },
            input,
            reveal,
            h("button", { type: "button", class: "icon-btn icon-btn--ghost", title: t("common.copy"), "aria-label": t("common.copy"), onClick: () => copyValue(input.value) }, icon("fa-copy")),
            h(
                "button",
                {
                    type: "button",
                    class: "icon-btn icon-btn--ghost",
                    title: t("password.generate"),
                    "aria-label": t("password.generate"),
                    onClick: () => {
                        generator.hidden = !generator.hidden;
                        if (!generator.hidden && !input.value) regenerate();
                    },
                },
                icon("fa-wand-magic-sparkles")
            )
        ),
        meter,
        generator
    );
    updateMeter();
    const { el } = wrap(field, control);
    return { el, focus: () => input.focus(), get: () => input.value, validate: () => "" };
}

const FACTORIES = {
    text: inputField,
    url: inputField,
    number: inputField,
    date: inputField,
    textarea: textareaField,
    markdown: markdownField,
    select: selectField,
    checkbox: checkboxField,
    mood: moodField,
    project: projectField,
    tags: tagsField,
    checklist: checklistField,
    password: passwordField,
};

export function createField(field, value) {
    const factory = FACTORIES[field.type];
    if (!factory) throw new Error(`Noma'lum maydon turi: ${field.type}`);
    return factory(field, value);
}
