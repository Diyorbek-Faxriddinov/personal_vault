/**
 * Sessiyalar: tasodifiy token cookie'da, uning SHA-256 xeshi bazada.
 * Baza o'g'irlansa ham, undagi xeshlardan foydalanib tizimga kirib bo'lmaydi.
 */
import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { generateToken, sha256 } from "../../lib/crypto.js";
import { notFound } from "../../lib/errors.js";
import { sessionsRepository } from "./sessions.repository.js";

export const sessionsService = {
    async create(userId, { ip, userAgent }, db = pool) {
        const token = generateToken();
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + config.session.ttlMs);
        const id = await sessionsRepository.create(
            { tokenHash: sha256(token), userId, ip, userAgent, createdAt, expiresAt },
            db
        );
        return { id, token, expiresAt };
    },

    /** Cookie'dagi tokenni tekshiradi; yaroqli bo'lsa { id, userId } qaytaradi */
    async resolve(token) {
        if (!token) return null;
        const session = await sessionsRepository.findByTokenHash(sha256(token));
        const now = new Date();
        if (!session || session.expires_at <= now || session.disabled_at) return null;

        // Har bir so'rovda emas, har 5 daqiqada bir marta yangilaymiz
        if (now - session.last_seen_at > config.session.touchIntervalMs) {
            await sessionsRepository.touch(session.id, now);
        }
        return { id: session.id, userId: session.user_id };
    },

    async list(userId, currentSessionId) {
        const rows = await sessionsRepository.listForUser(userId);
        return rows.map((row) => ({
            id: row.id,
            ip: row.ip,
            userAgent: row.user_agent,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
            expiresAt: row.expires_at,
            current: row.id === currentSessionId,
        }));
    },

    revokeByToken: (token) => sessionsRepository.deleteByTokenHash(sha256(token)),

    async revoke(userId, sessionId) {
        if (!(await sessionsRepository.deleteForUser(userId, sessionId))) throw notFound("errors.sessionNotFound");
    },

    revokeAll: (userId, { exceptId = null } = {}, db = pool) =>
        sessionsRepository.deleteAllForUser(userId, { exceptId }, db),

    purgeExpired: () => sessionsRepository.purgeExpired(),
};
