import { pool } from "../../db/pool.js";

/** Xavfsizlik jurnaliga yoziladigan hodisalar */
export const AuditEvent = Object.freeze({
    REGISTER: "register",
    LOGIN: "login",
    LOGIN_FAILED: "login_failed",
    LOGOUT: "logout",
    PASSWORD_CHANGED: "password_changed",
    RECOVERY_ROTATED: "recovery_rotated",
    RECOVERY_USED: "recovery_used",
    RECOVERY_FAILED: "recovery_failed",
    SESSION_REVOKED: "session_revoked",
    LOGIN_BLOCKED: "login_blocked",
    ACCOUNT_DISABLED: "account_disabled",
    ACCOUNT_ENABLED: "account_enabled",
    SESSIONS_REVOKED_BY_ADMIN: "sessions_revoked_by_admin",
});

export const auditRepository = {
    async log(userId, event, { ip = null, userAgent = null } = {}, db = pool) {
        await db.query("INSERT INTO audit_log (user_id, event, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)", [
            userId,
            event,
            ip,
            userAgent,
            new Date(),
        ]);
    },

    async listForUser(userId, limit = 50, db = pool) {
        const [rows] = await db.query(
            "SELECT id, event, ip, user_agent, created_at FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            [userId, limit]
        );
        return rows;
    },
};
