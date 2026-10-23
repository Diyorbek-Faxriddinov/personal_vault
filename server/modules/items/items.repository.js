import { pool } from "../../db/pool.js";

const COLUMNS = "id, ciphertext, version, created_at, updated_at, deleted_at";

export const itemsRepository = {
    /** since berilsa — faqat undan keyin o'zgarganlar (o'chirilganlar ham), aks holda faqat tiriklari */
    async list(userId, since = null, db = pool) {
        const [rows] = since
            ? await db.query(
                  `SELECT ${COLUMNS} FROM items WHERE user_id = ? AND updated_at > ? ORDER BY updated_at`,
                  [userId, since]
              )
            : await db.query(
                  `SELECT ${COLUMNS} FROM items WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at`,
                  [userId]
              );
        return rows;
    },

    async find(userId, id, db = pool) {
        const [rows] = await db.query(`SELECT ${COLUMNS} FROM items WHERE user_id = ? AND id = ?`, [userId, id]);
        return rows[0] ?? null;
    },

    async countAlive(userId, db = pool) {
        const [rows] = await db.query(
            "SELECT COUNT(*) AS total FROM items WHERE user_id = ? AND deleted_at IS NULL",
            [userId]
        );
        return Number(rows[0].total);
    },

    /**
     * Yangi yozuv qo'shadi. Shu id bilan o'chirilgan (tombstone) yozuv bo'lsa — uni tiklaydi,
     * tirik yozuv bo'lsa — tegmaydi.
     * @returns {Promise<"created"|"restored"|"exists">}
     */
    async insert(userId, { id, ciphertext }, db = pool) {
        const now = new Date();
        const [inserted] = await db.query(
            `INSERT IGNORE INTO items (id, user_id, ciphertext, version, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
            [id, userId, ciphertext, now, now]
        );
        if (inserted.affectedRows === 1) return "created";

        const [restored] = await db.query(
            `UPDATE items SET ciphertext = ?, version = version + 1, updated_at = ?, deleted_at = NULL
             WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL`,
            [ciphertext, now, userId, id]
        );
        return restored.affectedRows === 1 ? "restored" : "exists";
    },

    /** Optimistik qulf: faqat versiya mos kelsa yangilanadi */
    async update(userId, id, { ciphertext, version }, db = pool) {
        const [result] = await db.query(
            `UPDATE items SET ciphertext = ?, version = version + 1, updated_at = ?
             WHERE user_id = ? AND id = ? AND version = ? AND deleted_at IS NULL`,
            [ciphertext, new Date(), userId, id, version]
        );
        return result.affectedRows === 1;
    },

    /** Yozuvni o'chiradi, lekin sinxronizatsiya uchun "tombstone" qoldiradi */
    async markDeleted(userId, id, db = pool) {
        const now = new Date();
        const [result] = await db.query(
            `UPDATE items SET ciphertext = '', version = version + 1, updated_at = ?, deleted_at = ?
             WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
            [now, now, userId, id]
        );
        return result.affectedRows === 1;
    },
};
