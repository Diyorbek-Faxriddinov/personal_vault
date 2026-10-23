/**
 * Ma'lumotlar bazasini birinchi marta tayyorlash:
 *   1) DB_NAME bazasini yaratadi,
 *   2) DB_ADMIN_USER berilgan bo'lsa — ilova uchun alohida, cheklangan huquqli DB_USER yaratadi,
 *   3) migratsiyalarni bajaradi.
 *
 *   npm run db:setup
 */
import mysql from "mysql2/promise";
import { config } from "../config.js";
import { runMigrations } from "./migrate.js";

const adminUser = process.env.DB_ADMIN_USER;
const adminPassword = process.env.DB_ADMIN_PASSWORD ?? "";
const { host, port, database, user, password } = config.db;

async function main() {
    const useAdmin = Boolean(adminUser) && adminUser !== user;
    const connection = await mysql.createConnection({
        host,
        port,
        user: useAdmin ? adminUser : user,
        password: useAdmin ? adminPassword : password,
    });

    try {
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        console.log(`✓ "${database}" bazasi tayyor`);

        if (useAdmin) {
            const privileges = "SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP";
            const userAccount = `${mysql.escape(user)}@'localhost'`;
            const userPassword = mysql.escape(password);

            await connection.query(`CREATE USER IF NOT EXISTS ${userAccount} IDENTIFIED BY ${userPassword}`);
            await connection.query(`ALTER USER ${userAccount} IDENTIFIED BY ${userPassword}`);
            await connection.query(`GRANT ${privileges} ON \`${database}\`.* TO ${userAccount}`);
            // `npm test` alohida test bazasida ishlaydi va uni har safar tozalaydi
            await connection.query(`GRANT ${privileges} ON \`${database}_test\`.* TO ${userAccount}`);
            console.log(`✓ "${user}" foydalanuvchisi faqat "${database}" (va "${database}_test") bazalariga huquq bilan yaratildi`);
        }
    } finally {
        await connection.end();
    }

    await runMigrations();
    console.log("\nTayyor! Serverni ishga tushiring: npm start");
}

main().catch((error) => {
    console.error("\nBazani tayyorlashda xato:", error.message);
    if (error.code === "ER_ACCESS_DENIED_ERROR") {
        console.error("MySQL login/parolini .env faylida tekshiring (DB_USER/DB_PASSWORD yoki DB_ADMIN_USER/DB_ADMIN_PASSWORD).");
    }
    process.exit(1);
});
