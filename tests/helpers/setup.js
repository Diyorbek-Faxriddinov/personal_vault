/**
 * Test muhiti. Har doim ALOHIDA test bazasida ishlaydi va uni boshidan yaratadi.
 * Asosiy bazaga tegmaslik uchun nom "_test" bilan tugashi shart.
 *
 * Bazaga ulanish ma'lumotlari .env faylidan (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) olinadi.
 */
import mysql from "mysql2/promise";

process.env.NODE_ENV = "test";
process.env.APP_SECRET ??= "test-app-secret-0123456789-abcdefghijklmnop";
process.env.ANTHROPIC_API_KEY = ""; // testlar hech qachon pullik API'ga murojaat qilmaydi
process.env.ADMIN_EMAILS = "boss@example.uz, boss2@example.uz";
process.env.DB_NAME = process.env.TEST_DB_NAME ?? `${process.env.DB_NAME_BASE ?? "shaxsiy_vault"}_test`;

if (!process.env.DB_NAME.endsWith("_test")) {
    throw new Error(`Test bazasi nomi "_test" bilan tugashi kerak, hozir: ${process.env.DB_NAME}`);
}

const { config } = await import("../../server/config.js");
const { runMigrations } = await import("../../server/db/migrate.js");

/** Test bazasini o'chirib, qaytadan yaratadi va migratsiyalarni bajaradi */
export async function resetDatabase() {
    const { database, ...connection } = config.db;
    const admin = await mysql.createConnection(connection);
    try {
        await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
        await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
        await admin.end();
    }
    await runMigrations({ log: () => {} });
}

export { config };
