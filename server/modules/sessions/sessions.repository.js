import { pool } from "../../db/pool.js";

export const sessionsRepository = {
    async create({ tokenHash, userId, ip, userAgent, createdAt, expiresAt }, db = pool) {
        const [result] = await db.query(
            `INSERT INTO sessions (token_hash, user_id, ip, user_agent, created_at, last_seen_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tokenHash, userId, ip, userAgent, createdAt, createdAt, expiresAt]
        );
        return result.insertId;
    },

    async findByTokenHash(tokenHash, db = pool) {
        const [rows] = await db.query(
            `SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, u.disabled_at
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?`,
            [tokenHash]
        );
        return rows[0] ?? null;
    },

    async touch(id, at, db = pool) {
        await db.query("UPDATE sessions SET last_seen_at = ? WHERE id = ?", [at, id]);
    },

    async listForUser(userId, db = pool) {
        const [rows] = await db.query(
            `SELECT id, ip, user_agent, created_at, last_seen_at, expires_at
             FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
            [userId, new Date()]
        );
        return rows;
    },

    async deleteByTokenHash(tokenHash, db = pool) {
        await db.query("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    },

    async deleteForUser(userId, id, db = pool) {
        const [result] = await db.query("DELETE FROM sessions WHERE user_id = ? AND id = ?", [userId, id]);
        return result.affectedRows;
    },

    async deleteAllForUser(userId, { exceptId = null } = {}, db = pool) {
        const [result] = await db.query("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [userId, exceptId ?? 0]);
        return result.affectedRows;
    },

    async purgeExpired(db = pool) {
        const [result] = await db.query("DELETE FROM sessions WHERE expires_at <= ?", [new Date()]);
        return result.affectedRows;
    },
};
