/**
 * History API asosidagi router: "/tasks/:id" kabi yo'llar, ichki havolalarni ushlab qolish,
 * saqlanmagan o'zgarishlar bo'lsa sahifadan chiqishdan oldin so'rash (leave guard).
 */
function compile(path) {
    if (path === "*") return { regex: /(?!)/, keys: [] }; // hech narsaga mos kelmaydi — zaxira marshrut
    const keys = [];
    const pattern = path.replace(/\/:([A-Za-z]+)/g, (_, key) => {
        keys.push(key);
        return "/([^/]+)";
    });
    return { regex: new RegExp(`^${pattern}/?$`), keys };
}

export function createRouter(routes, onChange) {
    const compiled = routes.map((route) => ({ ...route, ...compile(route.path) }));
    let leaveGuard = null;
    let currentUrl = location.pathname + location.search;

    function resolve(pathname) {
        for (const route of compiled) {
            const match = pathname.match(route.regex);
            if (match) {
                const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
                return { route, params };
            }
        }
        return { route: compiled.find((route) => route.path === "*"), params: {} };
    }

    function render() {
        const url = new URL(location.href);
        currentUrl = url.pathname + url.search;
        return onChange({ ...resolve(url.pathname), query: Object.fromEntries(url.searchParams), path: url.pathname });
    }

    async function canLeave() {
        if (!leaveGuard) return true;
        const allowed = await leaveGuard();
        if (allowed) leaveGuard = null;
        return allowed;
    }

    async function navigate(to, { replace = false, force = false } = {}) {
        if (!force && !(await canLeave())) return;
        leaveGuard = null;
        if (to !== location.pathname + location.search + location.hash) {
            history[replace ? "replaceState" : "pushState"]({}, "", to);
        }
        if (!location.hash) window.scrollTo(0, 0);
        render();
    }

    window.addEventListener("popstate", async () => {
        const target = location.pathname + location.search;
        if (leaveGuard) {
            history.pushState({}, "", currentUrl); // hozircha joyida qolamiz
            if (await canLeave()) navigate(target, { force: true });
            return;
        }
        render();
    });

    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[href]");
        if (!link || event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (link.target || link.hasAttribute("download") || link.dataset.external !== undefined) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
        event.preventDefault();
        navigate(url.pathname + url.search + url.hash);
    });

    return {
        navigate,
        render,
        /** fn: () => boolean | Promise<boolean>; null — himoyani olib tashlash */
        setLeaveGuard(fn) {
            leaveGuard = fn;
        },
    };
}
