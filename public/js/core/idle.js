/**
 * Faolsizlik bo'yicha avtomatik qulflash. Vaqt real soat bilan hisoblanadi —
 * kompyuter uyqu rejimidan qaytganda ham to'g'ri ishlaydi.
 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"];

export function createIdleLock({ getMinutes, onIdle }) {
    let lastActivity = Date.now();
    let timer = null;
    let lastBump = 0;

    const bump = () => {
        const now = Date.now();
        if (now - lastBump > 1000) {
            lastActivity = now;
            lastBump = now;
        }
    };

    const check = () => {
        const minutes = getMinutes();
        if (minutes > 0 && Date.now() - lastActivity > minutes * 60_000) onIdle();
    };

    return {
        start() {
            if (timer) return;
            lastActivity = Date.now();
            ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, bump, { passive: true }));
            document.addEventListener("visibilitychange", check);
            timer = setInterval(check, 10_000);
        },
        stop() {
            clearInterval(timer);
            timer = null;
            ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, bump));
            document.removeEventListener("visibilitychange", check);
        },
    };
}
