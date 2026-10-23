/**
 * Admin amallari.
 *
 * Muhim: admin ham foydalanuvchilarning yozuvlarini O'QIY OLMAYDI — ular har bir foydalanuvchining
 * master paroli bilan brauzerda shifrlangan, kalit serverda yo'q. Admin faqat hisoblarni boshqaradi.
 */
import { forbidden, notFound } from "../../lib/errors.js";
import { AuditEvent, auditRepository } from "../audit/audit.repository.js";
import { isAdminEmail } from "../auth/auth.service.js";
import { sessionsService } from "../sessions/sessions.service.js";
import { usersRepository } from "../users/users.repository.js";
import { adminRepository } from "./admin.repository.js";

const toUserDto = (row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    disabledAt: row.disabled_at,
    itemCount: Number(row.item_count),
    storageBytes: Number(row.storage_bytes),
    sessionCount: Number(row.session_count),
    isAdmin: isAdminEmail(row.email),
});

/** Admin o'zini va boshqa adminlarni bloklay/o'chira olmaydi — tizimdan "qulflanib qolish"ning oldini olish */
async function requireManageable(adminSession, userId) {
    const user = await adminRepository.findUser(userId);
    if (!user) throw notFound("errors.userNotFound");
    if (user.id === adminSession.userId) throw forbidden("errors.cannotManageSelf");
    if (isAdminEmail(user.email)) throw forbidden("errors.cannotManageAdmin");
    return user;
}

export const adminService = {
    stats: () => adminRepository.stats(),

    async listUsers({ query, page, pageSize }) {
        const { rows, total } = await adminRepository.listUsers({ query, limit: pageSize, offset: (page - 1) * pageSize });
        return { users: rows.map(toUserDto), total, page, pageSize };
    },

    async setDisabled(adminSession, userId, disabled, meta) {
        const user = await requireManageable(adminSession, userId);
        await usersRepository.setDisabled(user.id, disabled);
        if (disabled) await sessionsService.revokeAll(user.id);
        await auditRepository.log(user.id, disabled ? AuditEvent.ACCOUNT_DISABLED : AuditEvent.ACCOUNT_ENABLED, meta);
        return toUserDto(await adminRepository.findUser(user.id));
    },

    async revokeSessions(adminSession, userId, meta) {
        const user = await requireManageable(adminSession, userId);
        const revoked = await sessionsService.revokeAll(user.id);
        await auditRepository.log(user.id, AuditEvent.SESSIONS_REVOKED_BY_ADMIN, meta);
        return revoked;
    },

    async deleteUser(adminSession, userId) {
        const user = await requireManageable(adminSession, userId);
        await usersRepository.delete(user.id); // yozuvlar, sessiyalar, jurnal — CASCADE
    },

    async listAudit(filters) {
        const rows = await adminRepository.listAudit(filters);
        return rows.map((row) => ({
            id: row.id,
            event: row.event,
            ip: row.ip,
            userAgent: row.user_agent,
            createdAt: row.created_at,
            user: { id: row.user_id, email: row.email },
        }));
    },
};
