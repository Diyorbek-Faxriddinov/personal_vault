/**
 * Admin uchun so'rovlar. Faqat metadata (sonlar, sanalar, hajmlar) — shifrlangan mazmun hech qachon tanlanmaydi.
 */
import { pool } from "../../db/pool.js";

const USER_SUMMARY = `
    u.id, u.email, u.created_at, u.last_login_at, u.disabled_at,
    (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id AND i.deleted_at IS NULL) AS item_count,
    (SELECT COALESCE(SUM(LENGTH(i.ciphertext)), 0) FROM items i WHERE i.user_id = u.id) AS storage_bytes,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS session_count`;

export const adminRepository = {
    async stats(db = pool) {
        const now = new Date();
        const days = (n) => new Date(now.getTime() - n * 86_400_000);
        const [[row]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM users WHERE disabled_at IS NOT NULL) AS disabled_users,
                (SELECT COUNT(*) FROM users WHERE last_login_at > ?) AS active_users_30d,
                (SELECT COUNT(*) FROM users WHERE created_at > ?) AS new_users_30d,
                (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL) AS items,
                (SELECT COALESCE(SUM(LENGTH(ciphertext)), 0) FROM items) AS storage_bytes,
                (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) AS active_sessions,
                (SELECT COUNT(*) FROM audit_log WHERE event IN ('login_failed', 'recovery_failed', 'login_blocked') AND created_at > ?) AS failed_logins_24h,
                (SELECT COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema = DATABASE()) AS database_bytes`,
            [days(30), days(30), now, days(1)]
        );
        return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    },

    async listUsers({ query, limit, offset }, db = pool) {
        const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const [rows] = await db.query(
            `SELECT ${USER_SUMMARY} FROM users u
             WHERE u.email LIKE ?
             ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
            [new Date(), like, limit, offset]
        );
        const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM users WHERE email LIKE ?", [like]);
        return { rows, total: Number(total) };
    },

    async findUser(id, db = pool) {
        const [rows] = await db.query(`SELECT ${USER_SUMMARY} FROM users u WHERE u.id = ?`, [new Date(), id]);
        return rows[0] ?? null;
    },

    async listAudit({ event, userId, limit }, db = pool) {
        const conditions = [];
        const params = [];
        if (event) {
            conditions.push("a.event = ?");
            params.push(event);
        }
        if (userId) {
            conditions.push("a.user_id = ?");
            params.push(userId);
        }
        const [rows] = await db.query(
            `SELECT a.id, a.event, a.ip, a.user_agent, a.created_at, u.id AS user_id, u.email
             FROM audit_log a JOIN users u ON u.id = a.user_id
             ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
             ORDER BY a.id DESC LIMIT ?`,
            [...params, limit]
        );
        return rows;
    },
};
