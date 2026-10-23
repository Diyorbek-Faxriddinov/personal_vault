/**
 * DOM yordamchilari.
 *
 * h("button", { class: "btn", onClick }, "Matn") — element yaratadi. Matnlar har doim textNode
 * bo'lib qo'shiladi, ya'ni foydalanuvchi ma'lumoti hech qachon HTML sifatida talqin qilinmaydi (XSS'dan himoya).
 */
const PROPERTIES = new Set([
    "value", "checked", "disabled", "selected", "hidden", "indeterminate", "readOnly",
    "required", "multiple", "tabIndex", "open", "min", "max", "step",
]);

export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") el.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (key === "style") for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v);
        else if (key === "ref") value(el);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (PROPERTIES.has(key)) el[key] = value;
        else el.setAttribute(key, value === true ? "" : value);
    }
    append(el, children);
    return el;
}

export function append(parent, children) {
    for (const child of [children].flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        parent.append(child instanceof Node ? child : String(child));
    }
    return parent;
}

/** replaceChildren'ning xavfsiz varianti: massivlar ochiladi, null/false/undefined tashlab yuboriladi */
export const setChildren = (parent, ...children) => {
    parent.replaceChildren();
    return append(parent, children);
};

export const icon = (name, extraClass) => h("i", { class: ["fa-solid", name, extraClass], "aria-hidden": "true" });

export const clear = (el) => {
    el.replaceChildren();
    return el;
};

export function debounce(fn, ms = 200) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = h("textarea", { value: text, class: "visually-hidden" });
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
    }
}

export function downloadFile({ filename, content, mime }) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = h("a", { href: url, download: filename, "data-external": "" });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const readFileText = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });

/** Klaviatura yorliqlarini chiroyli ko'rsatish: ["Ctrl", "K"] */
export const kbd = (...keys) => h("span", { class: "kbd-group" }, keys.map((key) => h("kbd", {}, key)));

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform ?? "");
export const modKey = isMac ? "⌘" : "Ctrl";
