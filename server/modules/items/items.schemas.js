import { z } from "zod";
import { config } from "../../config.js";
import { encrypted, uuid } from "../../lib/schemas.js";

const ciphertext = encrypted(config.limits.itemCiphertextChars);

export const itemsSchemas = {
    listQuery: z.object({
        since: z.iso.datetime({ offset: true }).optional(),
    }),

    idParams: z.object({ id: uuid }),

    create: z.object({ id: uuid, ciphertext }),

    update: z.object({ ciphertext, version: z.number().int().positive() }),

    batch: z.object({
        items: z.array(z.object({ id: uuid, ciphertext })).min(1).max(config.limits.batchSize),
    }),
};
