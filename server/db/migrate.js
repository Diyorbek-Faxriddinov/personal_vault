/**
 * Migratsiyalar: server/db/migrations/*.sql fayllari nom tartibida, faqat bir marta bajariladi.
 *   npm run db:migrate
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../config.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations({ log = console.log } = {}) {
    const connection = await mysql.createConnection({ ...config.db, multipleStatements: true, timezone: "Z" });
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name        VARCHAR(255) NOT NULL PRIMARY KEY,
                applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4`);

        const [rows] = await connection.query("SELECT name FROM schema_migrations");
        const applied = new Set(rows.map((row) => row.name));
        const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();

        let count = 0;
        for (const file of files) {
            if (applied.has(file)) continue;
            const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
            log(`→ ${file}`);
            await connection.query(sql);
            await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
            count++;
        }
        log(count ? `✓ ${count} ta migratsiya bajarildi` : "✓ Ma'lumotlar bazasi sxemasi dolzarb");
    } finally {
        await connection.end();
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    runMigrations().catch((error) => {
        console.error("Migratsiya xatosi:", error.message);
        process.exit(1);
    });
}
