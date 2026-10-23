/**
 * Hisobni boshqarish. Xavfli amallar (parol, tiklash kaliti, hisobni o'chirish)
 * sessiyaning o'zi bilan emas, joriy master paroldan hosil qilingan authKey bilan tasdiqlanadi.
 */
import { transaction } from "../../db/pool.js";
import { hashSecret, verifySecret } from "../../lib/crypto.js";
import { forbidden, unauthorized } from "../../lib/errors.js";
import { AuditEvent, auditRepository } from "../audit/audit.repository.js";
import { sessionsService } from "../sessions/sessions.service.js";
import { usersRepository } from "../users/users.repository.js";

async function requireCurrentPassword(userId, currentAuthKey) {
    const user = await usersRepository.findById(userId);
    if (!user) throw unauthorized();
    if (!(await verifySecret(currentAuthKey, user.auth_hash))) throw forbidden("errors.wrongCurrentPassword");
    return user;
}

export const accountService = {
    /** Parol almashganda DEK o'zgarmaydi — faqat qayta "o'raladi". Boshqa qurilmalardagi sessiyalar yopiladi. */
    async changePassword(session, input, meta) {
        await requireCurrentPassword(session.userId, input.currentAuthKey);
        const authHash = await hashSecret(input.authKey);
        await transaction(async (db) => {
            await usersRepository.updateCredentials(
                session.userId,
                { authHash, kdfSalt: input.kdfSalt, kdfIterations: input.kdfIterations, wrappedKey: input.wrappedKey },
                db
            );
            await sessionsService.revokeAll(session.userId, { exceptId: session.id }, db);
            await auditRepository.log(session.userId, AuditEvent.PASSWORD_CHANGED, meta, db);
        });
    },

    async rotateRecovery(session, input, meta) {
        await requireCurrentPassword(session.userId, input.currentAuthKey);
        const recoveryAuthHash = await hashSecret(input.recoveryAuthKey);
        await usersRepository.updateRecovery(session.userId, {
            recoveryAuthHash,
            recoveryWrappedKey: input.recoveryWrappedKey,
        });
        await auditRepository.log(session.userId, AuditEvent.RECOVERY_ROTATED, meta);
    },

    saveSettings: (session, encryptedSettings) => usersRepository.updateSettings(session.userId, encryptedSettings),

    async deleteAccount(session, currentAuthKey) {
        await requireCurrentPassword(session.userId, currentAuthKey);
        await usersRepository.delete(session.userId); // sessions, items, audit_log — ON DELETE CASCADE
    },

    listSessions: (session) => sessionsService.list(session.userId, session.id),

    async revokeSession(session, sessionId, meta) {
        await sessionsService.revoke(session.userId, sessionId);
        await auditRepository.log(session.userId, AuditEvent.SESSION_REVOKED, meta);
    },

    async revokeOtherSessions(session, meta) {
        const count = await sessionsService.revokeAll(session.userId, { exceptId: session.id });
        if (count) await auditRepository.log(session.userId, AuditEvent.SESSION_REVOKED, meta);
        return count;
    },

    async listActivity(session) {
        const rows = await auditRepository.listForUser(session.userId);
        return rows.map((row) => ({
            id: row.id,
            event: row.event,
            ip: row.ip,
            userAgent: row.user_agent,
            createdAt: row.created_at,
        }));
    },
};
