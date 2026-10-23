/**
 * Express ilovasi. Testlar ham shu funksiyadan foydalanadi (serverni portga bog'lamasdan).
 */
import path from "node:path";
import express from "express";
import { config, ROOT_DIR } from "./config.js";
import { checkConnection } from "./db/pool.js";
import { detectLanguage } from "./lib/i18n.js";
import { loadSession } from "./middleware/auth.js";
import { csrfProtection } from "./middleware/csrf.js";
import { apiNotFound, errorHandler } from "./middleware/error-handler.js";
import { apiLimiter } from "./middleware/rate-limit.js";
import { noStore, securityHeaders } from "./middleware/security.js";
import { accountRoutes } from "./modules/account/account.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { aiRoutes } from "./modules/ai/ai.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { itemsRoutes } from "./modules/items/items.routes.js";

function createApiRouter() {
    const api = express.Router();
    const jsonParser = express.json({ limit: "3mb" });

    api.use(detectLanguage, noStore, apiLimiter);
    // /items/batch o'zining kattaroq chegarali parseriga ega
    api.use((req, res, next) => (req.path === "/items/batch" ? next() : jsonParser(req, res, next)));
    api.use(csrfProtection, loadSession);

    api.get("/health", async (_req, res) => {
        res.json({ ok: true, database: await checkConnection().catch(() => false) });
    });
    api.use("/auth", authRoutes);
    api.use("/account", accountRoutes);
    api.use("/items", itemsRoutes);
    api.use("/ai", aiRoutes);
    api.use("/admin", adminRoutes);

    api.use(apiNotFound);
    return api;
}

export function createApp() {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", config.trustProxy ? 1 : false);

    app.use(securityHeaders());
    app.use("/api", createApiRouter());

    // Frontend: ikonkalar node_modules'dan, qolgani public/ dan. Hech qanday tashqi CDN yo'q.
    const staticOptions = { index: false, setHeaders: (res) => res.set("Cache-Control", "no-cache") };
    app.use(
        "/vendor/fontawesome",
        express.static(path.join(ROOT_DIR, "node_modules/@fortawesome/fontawesome-free"), staticOptions)
    );
    app.use(express.static(config.publicDir, staticOptions));

    // SPA: barcha boshqa sahifalar index.html ga yo'naltiriladi, yo'lni brauzerdagi router hal qiladi
    app.get("/{*path}", (_req, res) => {
        res.set("Cache-Control", "no-cache");
        res.sendFile(path.join(config.publicDir, "index.html"));
    });

    app.use(errorHandler);
    return app;
}
