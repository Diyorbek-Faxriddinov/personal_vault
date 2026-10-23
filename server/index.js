/**
 * Serverni ishga tushirish:  npm start   (yoki ishlab chiqishda: npm run dev)
 */
import { createApp } from "./app.js";
import { config } from "./config.js";
import { checkConnection, pool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./lib/logger.js";
import { sessionsService } from "./modules/sessions/sessions.service.js";

async function start() {
    try {
        await checkConnection();
    } catch (error) {
        logger.error(`MySQL'ga ulanib bo'lmadi (${config.db.host}:${config.db.port}/${config.db.database}): ${error.message}`);
        logger.error("Sozlamalarni .env faylida tekshiring yoki bazani tayyorlang: npm run db:setup");
        process.exit(1);
    }
    await runMigrations({ log: (line) => logger.info(line) });

    const server = createApp().listen(config.port, config.host, () => {
        logger.info(`Shaxsiy Vault ishga tushdi: http://${config.host}:${config.port}`);
        if (!config.ai.enabled) logger.info("AI maslahatchi o'chiq (ANTHROPIC_API_KEY berilmagan)");
    });

    // Muddati o'tgan sessiyalarni har soatda tozalash
    const cleanup = setInterval(() => {
        sessionsService.purgeExpired().catch((error) => logger.warn(`Sessiyalarni tozalashda xato: ${error.message}`));
    }, 60 * 60 * 1000);
    cleanup.unref();

    const shutdown = (signal) => {
        logger.info(`${signal} — server to'xtatilmoqda...`);
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
