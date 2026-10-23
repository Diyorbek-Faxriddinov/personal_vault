import { z } from "zod";
import { email, encrypted, kdfIterations, kdfSalt, key256 } from "../../lib/schemas.js";

const wrappedKey = encrypted(512);

/** Yangi master paroldan hosil qilingan kalitlar to'plami (ro'yxat, tiklash, parol almashtirishda) */
export const credentials = {
    kdfSalt,
    kdfIterations,
    authKey: key256,
    wrappedKey,
};

export const recoveryMaterial = {
    recoveryAuthKey: key256,
    recoveryWrappedKey: wrappedKey,
};

export const authSchemas = {
    prelogin: z.object({ email }),

    register: z.object({
        email,
        ...credentials,
        ...recoveryMaterial,
        encryptedSettings: encrypted(100_000).optional(),
    }),

    login: z.object({ email, authKey: key256 }),

    recoveryChallenge: z.object({ email, recoveryAuthKey: key256 }),

    recoveryReset: z.object({
        email,
        recoveryAuthKey: key256,
        ...credentials,
        newRecoveryAuthKey: key256,
        newRecoveryWrappedKey: wrappedKey,
    }),
};
