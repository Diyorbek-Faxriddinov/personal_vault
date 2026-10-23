import { z } from "zod";
import { encrypted, key256, positiveId } from "../../lib/schemas.js";
import { credentials, recoveryMaterial } from "../auth/auth.schemas.js";

export const accountSchemas = {
    changePassword: z.object({ currentAuthKey: key256, ...credentials }),

    rotateRecovery: z.object({ currentAuthKey: key256, ...recoveryMaterial }),

    settings: z.object({ encryptedSettings: encrypted(100_000) }),

    deleteAccount: z.object({ currentAuthKey: key256 }),

    sessionParams: z.object({ id: positiveId }),
};
