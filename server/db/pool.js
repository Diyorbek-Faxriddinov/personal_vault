/**
 * MySQL ulanishlar havzasi (pool). Barcha vaqtlar UTC'da saqlanadi va o'qiladi.
 */
import mysql from "mysql2/promise";
import { config } from "../config.js";

export const pool = mysql.createPool({
    ...config.db,
    waitForConnections: true,
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
    supportBigNumbers: true,
    bigNumberStrings: false,
});

pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
});

/** Bir nechta so'rovni bitta tranzaksiyada bajaradi: xato bo'lsa hammasi bekor qilinadi */
export async function transaction(work) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function checkConnection() {
    const [rows] = await pool.query("SELECT 1 AS ok");
    return rows[0].ok === 1;
}
