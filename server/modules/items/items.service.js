/**
 * Yozuvlar xizmati. Server yozuv ichida nima borligini bilmaydi —
 * u faqat shifrlangan bloklarni saqlaydi, versiyalaydi va sinxronlaydi.
 */
import { config } from "../../config.js";
import { transaction } from "../../db/pool.js";
import { conflict, notFound, tooLarge } from "../../lib/errors.js";
import { itemsRepository } from "./items.repository.js";

export const toItemDto = (row) => ({
    id: row.id,
    ciphertext: row.ciphertext,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
});

async function ensureCapacity(userId, adding, db) {
    const total = await itemsRepository.countAlive(userId, db);
    if (total + adding > config.limits.itemsPerUser) {
        throw tooLarge("errors.itemLimit", { limit: config.limits.itemsPerUser });
    }
}

export const itemsService = {
    /**
     * since yo'q — barcha tirik yozuvlar (to'liq sinxronizatsiya).
     * since bor — o'shandan keyingi o'zgarishlar, jumladan o'chirilganlar (qisman sinxronizatsiya).
     * cursor — keyingi so'rovda since sifatida yuboriladi.
     */
    async list(userId, since) {
        const rows = await itemsRepository.list(userId, since ? new Date(since) : null);
        const latest = rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), since ? new Date(since) : new Date(0));
        return { items: rows.map(toItemDto), cursor: latest.toISOString() };
    },

    async create(userId, { id, ciphertext }) {
        await ensureCapacity(userId, 1);
        const outcome = await itemsRepository.insert(userId, { id, ciphertext });
        if (outcome === "exists") throw conflict("errors.itemExists");
        return toItemDto(await itemsRepository.find(userId, id));
    },

    /** Boshqa qurilmada o'zgargan bo'lsa — 409 va serverdagi joriy versiya qaytadi */
    async update(userId, id, { ciphertext, version }) {
        if (await itemsRepository.update(userId, id, { ciphertext, version })) {
            return toItemDto(await itemsRepository.find(userId, id));
        }
        const current = await itemsRepository.find(userId, id);
        if (!current || current.deleted_at) throw notFound("errors.itemGone");
        throw conflict("errors.itemConflict", { current: toItemDto(current) });
    },

    async remove(userId, id) {
        if (!(await itemsRepository.markDeleted(userId, id))) throw notFound("errors.itemNotFound");
    },

    /** Import uchun: mavjud tirik yozuvlar o'tkazib yuboriladi, o'chirilganlari tiklanadi */
    async batchCreate(userId, items) {
        return transaction(async (db) => {
            await ensureCapacity(userId, items.length, db);
            const summary = { created: 0, restored: 0, skipped: 0 };
            for (const item of items) {
                const outcome = await itemsRepository.insert(userId, item, db);
                summary[outcome === "exists" ? "skipped" : outcome]++;
            }
            return summary;
        });
    },
};
