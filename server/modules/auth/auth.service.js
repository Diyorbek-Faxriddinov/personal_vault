/**
 * Autentifikatsiya biznes-mantig'i.
 *
 * Oqim (zero-knowledge):
 *   1. Brauzer /prelogin dan KDF salt oladi va master paroldan ikki kalit hosil qiladi:
 *      authKey (serverga kirish uchun) va wrapKey (faqat brauzerda qoladi).
 *   2. Server authKey'ni scrypt xeshi bilan solishtiradi va shifrlangan DEK (wrappedKey) ni qaytaradi.
 *   3. Brauzer DEK'ni wrapKey bilan ochadi va barcha yozuvlarni o'zi shifrlaydi/ochadi.
 */
import { config } from "../../config.js";
import { transaction } from "../../db/pool.js";
import { fakeKdfSalt, hashSecret, verifyAgainstDummy, verifySecret } from "../../lib/crypto.js";
import { conflict, forbidden, unauthorized } from "../../lib/errors.js";
import { AuditEvent, auditRepository } from "../audit/audit.repository.js";
import { sessionsService } from "../sessions/sessions.service.js";
import { usersRepository } from "../users/users.repository.js";

export const DEFAULT_KDF_ITERATIONS = 600_000;

const INVALID_LOGIN = "errors.invalidLogin";
const INVALID_RECOVERY = "errors.invalidRecovery";
const ACCOUNT_DISABLED = "errors.accountDisabled";

export const isAdminEmail = (email) => config.adminEmails.has(email);

/** Brauzerga qaytariladigan hisob ma'lumotlari (xeshlar hech qachon chiqmaydi) */
export function toAccount(user) {
    return {
        user: {
            id: user.id,
            email: user.email,
            createdAt: user.created_at,
            lastLoginAt: user.last_login_at,
            isAdmin: isAdminEmail(user.email),
        },
        vault: {
            kdfSalt: user.kdf_salt,
            kdfIterations: user.kdf_iterations,
            wrappedKey: user.wrapped_key,
        },
        encryptedSettings: user.encrypted_settings,
    };
}

async function findUserByRecovery(email, recoveryAuthKey, meta) {
    const user = await usersRepository.findByEmail(email);
    if (!user) {
        await verifyAgainstDummy(recoveryAuthKey);
        throw unauthorized(INVALID_RECOVERY);
    }
    if (!(await verifySecret(recoveryAuthKey, user.recovery_auth_hash))) {
        await auditRepository.log(user.id, AuditEvent.RECOVERY_FAILED, meta);
        throw unauthorized(INVALID_RECOVERY);
    }
    if (user.disabled_at) throw forbidden(ACCOUNT_DISABLED);
    return user;
}

export const authService = {
    /** Noma'lum email uchun ham javob beradi — shunda kim ro'yxatdan o'tganini bilib bo'lmaydi */
    async prelogin(email) {
        const user = await usersRepository.findByEmail(email);
        return user
            ? { kdfSalt: user.kdf_salt, kdfIterations: user.kdf_iterations }
            : { kdfSalt: fakeKdfSalt(config.appSecret, email), kdfIterations: DEFAULT_KDF_ITERATIONS };
    },

    async register(input, meta) {
        if (await usersRepository.findByEmail(input.email)) {
            throw conflict("errors.emailTaken");
        }
        const [authHash, recoveryAuthHash] = await Promise.all([
            hashSecret(input.authKey),
            hashSecret(input.recoveryAuthKey),
        ]);

        let userId;
        try {
            userId = await usersRepository.create({ ...input, authHash, recoveryAuthHash });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") throw conflict("errors.emailTaken");
            throw error;
        }

        await auditRepository.log(userId, AuditEvent.REGISTER, meta);
        const session = await sessionsService.create(userId, meta);
        return { session, account: toAccount(await usersRepository.findById(userId)) };
    },

    async login({ email, authKey }, meta) {
        const user = await usersRepository.findByEmail(email);
        if (!user) {
            await verifyAgainstDummy(authKey);
            throw unauthorized(INVALID_LOGIN);
        }
        if (!(await verifySecret(authKey, user.auth_hash))) {
            await auditRepository.log(user.id, AuditEvent.LOGIN_FAILED, meta);
            throw unauthorized(INVALID_LOGIN);
        }
        // Bloklanganlik parol to'g'ri bo'lgandagina aytiladi — begonalarga hisob holati oshkor bo'lmaydi
        if (user.disabled_at) {
            await auditRepository.log(user.id, AuditEvent.LOGIN_BLOCKED, meta);
            throw forbidden(ACCOUNT_DISABLED);
        }

        await usersRepository.touchLogin(user.id);
        await auditRepository.log(user.id, AuditEvent.LOGIN, meta);
        const session = await sessionsService.create(user.id, meta);
        return { session, account: toAccount(user) };
    },

    async logout(session, token, meta) {
        await sessionsService.revokeByToken(token);
        if (session) await auditRepository.log(session.userId, AuditEvent.LOGOUT, meta);
    },

    async getAccount(userId) {
        const user = await usersRepository.findById(userId);
        if (!user) throw unauthorized();
        return toAccount(user);
    },

    /** Tiklash 1-qadam: tiklash kaliti to'g'ri bo'lsa, u bilan shifrlangan DEK qaytariladi */
    async recoveryChallenge({ email, recoveryAuthKey }, meta) {
        const user = await findUserByRecovery(email, recoveryAuthKey, meta);
        return { recoveryWrappedKey: user.recovery_wrapped_key };
    },

    /**
     * Tiklash 2-qadam: yangi master parol va yangi tiklash kaliti o'rnatiladi.
     * Eski barcha sessiyalar bekor qilinadi.
     */
    async recoveryReset(input, meta) {
        const user = await findUserByRecovery(input.email, input.recoveryAuthKey, meta);
        const [authHash, recoveryAuthHash] = await Promise.all([
            hashSecret(input.authKey),
            hashSecret(input.newRecoveryAuthKey),
        ]);

        const session = await transaction(async (db) => {
            await usersRepository.updateCredentials(
                user.id,
                { authHash, kdfSalt: input.kdfSalt, kdfIterations: input.kdfIterations, wrappedKey: input.wrappedKey },
                db
            );
            await usersRepository.updateRecovery(
                user.id,
                { recoveryAuthHash, recoveryWrappedKey: input.newRecoveryWrappedKey },
                db
            );
            await sessionsService.revokeAll(user.id, {}, db);
            await auditRepository.log(user.id, AuditEvent.RECOVERY_USED, meta, db);
            return sessionsService.create(user.id, meta, db);
        });

        return { session, account: toAccount(await usersRepository.findById(user.id)) };
    },
};
