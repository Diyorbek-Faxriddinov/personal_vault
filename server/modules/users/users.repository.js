import { pool } from "../../db/pool.js";

const COLUMNS = `id, email, auth_hash, kdf_salt, kdf_iterations, wrapped_key,
    recovery_auth_hash, recovery_wrapped_key, encrypted_settings, created_at, last_login_at, disabled_at`;

export const usersRepository = {
    async findByEmail(email, db = pool) {
        const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE email = ?`, [email]);
        return rows[0] ?? null;
    },

    async findById(id, db = pool) {
        const [rows] = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [id]);
        return rows[0] ?? null;
    },

    async create(user, db = pool) {
        const now = new Date();
        const [result] = await db.query(
            `INSERT INTO users (email, auth_hash, kdf_salt, kdf_iterations, wrapped_key,
                recovery_auth_hash, recovery_wrapped_key, encrypted_settings, created_at, updated_at, last_login_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.email,
                user.authHash,
                user.kdfSalt,
                user.kdfIterations,
                user.wrappedKey,
                user.recoveryAuthHash,
                user.recoveryWrappedKey,
                user.encryptedSettings ?? null,
                now,
                now,
                now,
            ]
        );
        return result.insertId;
    },

    async updateCredentials(id, { authHash, kdfSalt, kdfIterations, wrappedKey }, db = pool) {
        await db.query(
            "UPDATE users SET auth_hash = ?, kdf_salt = ?, kdf_iterations = ?, wrapped_key = ?, updated_at = ? WHERE id = ?",
            [authHash, kdfSalt, kdfIterations, wrappedKey, new Date(), id]
        );
    },

    async updateRecovery(id, { recoveryAuthHash, recoveryWrappedKey }, db = pool) {
        await db.query(
            "UPDATE users SET recovery_auth_hash = ?, recovery_wrapped_key = ?, updated_at = ? WHERE id = ?",
            [recoveryAuthHash, recoveryWrappedKey, new Date(), id]
        );
    },

    async updateSettings(id, encryptedSettings, db = pool) {
        await db.query("UPDATE users SET encrypted_settings = ?, updated_at = ? WHERE id = ?", [
            encryptedSettings,
            new Date(),
            id,
        ]);
    },

    async touchLogin(id, db = pool) {
        await db.query("UPDATE users SET last_login_at = ? WHERE id = ?", [new Date(), id]);
    },

    async setDisabled(id, disabled, db = pool) {
        const [result] = await db.query("UPDATE users SET disabled_at = ? WHERE id = ?", [disabled ? new Date() : null, id]);
        return result.affectedRows === 1;
    },

    async delete(id, db = pool) {
        await db.query("DELETE FROM users WHERE id = ?", [id]);
    },
};
