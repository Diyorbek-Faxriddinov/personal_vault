/**
 * Xavfsiz, ixcham Markdown renderer.
 * Avval BUTUN matn HTML-escape qilinadi, keyin faqat o'zimiz yaratgan teglar qo'shiladi.
 * Havolalar faqat http(s) va mailto bo'lishi mumkin (javascript: va h.k. bloklanadi).
 *
 * Qo'llab-quvvatlanadi: # sarlavhalar, **qalin**, *kursiv*, ~~o'chirilgan~~, `kod`, ```kod bloki```,
 * - ro'yxat, 1. raqamli ro'yxat, - [ ] vazifa, > iqtibos, ---, [havola](url), avtomatik havolalar.
 */
const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function safeUrl(url) {
    const decoded = url.replace(/&amp;/g, "&");
    if (/^(https?:\/\/|mailto:)/i.test(decoded)) return url;
    return null;
}

function inline(text) {
    const codes = [];
    let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
        codes.push(code);
        return `\u0000${codes.length - 1}\u0000`;
    });

    html = html
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
            const safe = safeUrl(url);
            return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : match;
        })
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
        .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,!?])/g, "$1<em>$2</em>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>");

    return html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

export function markdownToHtml(source = "") {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let list = null; // { tag, items }
    let paragraph = [];
    let quote = [];

    const flushParagraph = () => {
        if (paragraph.length) out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
        paragraph = [];
    };
    const flushList = () => {
        if (list) out.push(`<${list.tag}${list.task ? ' class="task-list"' : ""}>${list.items.join("")}</${list.tag}>`);
        list = null;
    };
    const flushQuote = () => {
        if (quote.length) out.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
        quote = [];
    };
    const flushAll = () => {
        flushParagraph();
        flushList();
        flushQuote();
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/^```/.test(line)) {
            flushAll();
            const code = [];
            while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
            out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            flushAll();
            const level = heading[1].length + 2; // h3..h5 — sahifa sarlavhalari bilan to'qnashmasin
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
            flushAll();
            out.push("<hr>");
            continue;
        }

        const quoteLine = line.match(/^>\s?(.*)$/);
        if (quoteLine) {
            flushParagraph();
            flushList();
            quote.push(quoteLine[1]);
            continue;
        }
        flushQuote();

        const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (task || bullet || ordered) {
            flushParagraph();
            const tag = ordered ? "ol" : "ul";
            if (!list || list.tag !== tag) {
                flushList();
                list = { tag, items: [], task: Boolean(task) };
            }
            if (task) {
                const checked = task[1].toLowerCase() === "x";
                list.task = true;
                list.items.push(`<li class="${checked ? "is-done" : ""}"><span class="task-box">${checked ? "✓" : ""}</span>${inline(task[2])}</li>`);
            } else {
                list.items.push(`<li>${inline((bullet ?? ordered)[1])}</li>`);
            }
            continue;
        }

        if (!line.trim()) {
            flushAll();
            continue;
        }
        flushList();
        paragraph.push(line);
    }
    flushAll();
    return out.join("");
}

/** Markdown'ni DOM elementga aylantiradi */
export function renderMarkdown(source, className = "markdown") {
    const container = document.createElement("div");
    container.className = className;
    container.innerHTML = markdownToHtml(source);
    return container;
}

/** Ro'yxatlar uchun: markdown belgilarisiz qisqa matn */
export function plainExcerpt(source = "", max = 160) {
    const text = String(source)
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^[#>\-*+\s]+|\[[ xX]\]/gm, "")
        .replace(/[*_~`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
