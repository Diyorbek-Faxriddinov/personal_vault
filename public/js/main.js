/**
 * Ilova kirish nuqtasi: marshrutlar, holatga qarab yo'naltirish, sinxronizatsiya va avtomatik qulflash.
 *
 *   guest    → faqat /login, /register, /recover
 *   locked   → faqat /unlock (sessiya bor, kalit yo'q)
 *   unlocked → ilovaning qolgan qismi
 */
import { t, onLanguageChange } from "./core/i18n.js";
import { createIdleLock } from "./core/idle.js";
import { createRouter } from "./core/router.js";
import { store } from "./core/store.js";
import { auth } from "./services/auth.js";
import { settings } from "./services/settings.js";
import { emptyState } from "./ui/components.js";
import { h } from "./ui/dom.js";
import { applyTheme, cachedTheme } from "./ui/theme.js";
import { toast } from "./ui/toast.js";
import { adminView } from "./views/admin.js";
import { advisorView } from "./views/advisor.js";
import { loginView, recoverView, registerView, unlockView } from "./views/auth.js";
import { collectionView } from "./views/collection.js";
import { dashboardView } from "./views/dashboard.js";
import { itemView, journalTodayView } from "./views/item.js";
import { settingsView } from "./views/settings.js";
import { createShell } from "./views/shell.js";
import { tagsView } from "./views/tags.js";
import { trashView } from "./views/trash.js";

applyTheme(cachedTheme());

const outlet = document.getElementById("app");
const SYNC_INTERVAL = 60_000;

const notFound = () => ({
    title: t("notFound.title"),
    el: emptyState({ iconName: "fa-map-signs", title: t("notFound.heading"), text: t("notFound.text"), action: { label: t("nav.home"), href: "/", icon: "fa-house" } }),
});

const routes = [
    { path: "/login", view: loginView, access: "guest" },
    { path: "/register", view: registerView, access: "guest" },
    { path: "/recover", view: recoverView, access: "guest" },
    { path: "/unlock", view: unlockView, access: "locked" },
    { path: "/", view: dashboardView },
    { path: "/advisor", view: advisorView },
    { path: "/settings", view: settingsView },
    { path: "/admin", view: adminView },
    { path: "/trash", view: trashView },
    { path: "/tags", view: tagsView },
    { path: "/tags/:tag", view: tagsView },
    { path: "/journal/today", view: journalTodayView },
    { path: "/:collection/:id", view: itemView },
    { path: "/:collection", view: collectionView },
    { path: "*", view: notFound },
];

let shell = null;
let cleanupView = null;
let renderToken = 0; // eskirgan (kechikkan) renderlar yangisining ustiga yozmasligi uchun
let pendingPath = null; // qulfdan/kirishdan keyin qaytiladigan sahifa

const router = createRouter(routes, renderRoute);

function mountShell() {
    if (shell) return shell;
    shell = createShell({ navigate: router.navigate });
    outlet.replaceChildren(shell.el);
    return shell;
}

function unmountShell() {
    shell?.destroy();
    shell = null;
}

function allowed(access) {
    const status = auth.status;
    if (status === "guest") return access === "guest";
    if (status === "locked") return access === "locked";
    return !access; // unlocked: ilova sahifalari
}

function redirectTarget() {
    if (auth.status === "guest") return "/login";
    if (auth.status === "locked") return "/unlock";
    const target = pendingPath ?? "/";
    pendingPath = null;
    return target;
}

async function renderRoute({ route, params, query, path }) {
    if (auth.status === "loading") return;

    if (!allowed(route.access)) {
        // Himoyalangan sahifaga to'g'ridan-to'g'ri kirilsa — kirishdan keyin o'sha yerga qaytamiz
        if (!route.access && auth.status !== "unlocked") pendingPath = location.pathname + location.search;
        router.navigate(redirectTarget(), { replace: true, force: true });
        return;
    }

    cleanupView?.();
    cleanupView = null;
    const token = ++renderToken;

    const ctx = { params, query, path, navigate: router.navigate, setLeaveGuard: router.setLeaveGuard };
    let result;
    try {
        result = (await route.view(ctx)) ?? notFound();
    } catch (error) {
        console.error(error);
        result = { title: t("error.title"), el: emptyState({ iconName: "fa-bug", title: t("error.pageFailed"), text: error.message }) };
    }
    if (token !== renderToken) {
        // Ko'rinish render paytida boshqa sahifaga yo'naltirdi — bu natija endi kerak emas
        result.cleanup?.();
        return;
    }
    cleanupView = result.cleanup ?? null;
    document.title = `${result.title} — ${t("app.name")}`;

    if (route.access) {
        unmountShell();
        outlet.replaceChildren(result.el);
    } else {
        const current = mountShell();
        current.setContent(result.el);
        current.setActive(path);
    }
}

// ─── Holat o'zgarishlari ──────────────────────────────────────────

let syncTimer = null;
const idle = createIdleLock({
    getMinutes: () => settings.get().autoLockMinutes,
    onIdle: () => {
        auth.lock();
        toast.info(t("lock.idle"));
    },
});

const syncNow = () => {
    if (auth.status !== "unlocked" || document.hidden) return;
    store.sync().catch(() => {});
};

auth.subscribe((status) => {
    if (status === "unlocked") {
        idle.start();
        syncTimer = setInterval(syncNow, SYNC_INTERVAL);
        if (store.corruptedCount) toast.warning(t("store.corrupted", { count: store.corruptedCount }));
    } else {
        idle.stop();
        clearInterval(syncTimer);
        if (status === "locked" && !pendingPath && !["/unlock", "/login"].includes(location.pathname)) {
            pendingPath = location.pathname + location.search;
        }
    }
    router.navigate(allowed(currentRoute()?.access) ? location.pathname + location.search : redirectTarget(), { replace: true, force: true });
});

function currentRoute() {
    return routes.find((route) => {
        if (route.path === "*") return false;
        const pattern = new RegExp(`^${route.path.replace(/\/:[A-Za-z]+/g, "/[^/]+")}/?$`);
        return pattern.test(location.pathname);
    });
}

window.addEventListener("focus", syncNow);
document.addEventListener("visibilitychange", syncNow);

// Til almashganda joriy sahifa va qobiq yangi tilda qayta chiziladi (ma'lumotlar va kalit xotirada qoladi).
// Kiritilgan matnlar (email, tiklash kaliti, ism...) saqlanib qoladi; parollar xavfsizlik uchun tiklanmaydi.
onLanguageChange(async () => {
    if (auth.status === "loading") return;
    const drafts = [...outlet.querySelectorAll("input[id]:not([type=password]):not([type=checkbox])")]
        .filter((input) => input.value)
        .map((input) => [input.id, input.value]);
    unmountShell();
    await router.render();
    for (const [id, value] of drafts) {
        const input = document.getElementById(id);
        if (input && input.type !== "password") input.value = value;
    }
});

// ─── Ishga tushirish ──────────────────────────────────────────────

try {
    await auth.init();
    router.render();
} catch (error) {
    outlet.replaceChildren(
        h(
            "div",
            { class: "auth" },
            emptyState({ iconName: "fa-plug-circle-xmark", title: t("boot.serverDown"), text: t("boot.serverDownText", { message: error.message }) })
        )
    );
}
