/**
 * Yozuvlar ustidagi tez-tez ishlatiladigan amallar (UI bilan bog'liq xabarlar shu yerda).
 */
import { t } from "../core/i18n.js";
import { ConflictError, store } from "../core/store.js";
import { displayTitle } from "../models/types.js";
import { formatDate } from "../ui/format.js";
import { toast } from "../ui/toast.js";
import { nextOccurrence, todayISO } from "./analytics.js";

export function reportError(error) {
    if (error instanceof ConflictError) {
        toast.warning(t("actions.conflict"));
    } else {
        toast.error(error.message || t("common.error"));
    }
}

async function safely(work) {
    try {
        return await work();
    } catch (error) {
        reportError(error);
        return null;
    }
}

/** Vazifani bajarilgan/bajarilmagan qiladi. Takrorlanuvchi vazifa keyingi muddatga o'tadi. */
export function toggleTask(task) {
    return safely(async () => {
        if (task.status === "done") {
            return store.update(task.id, { status: "todo", completedAt: null });
        }
        const next = nextOccurrence(task.dueDate, task.recurrence, todayISO());
        if (next) {
            await store.update(task.id, {
                dueDate: next,
                status: "todo",
                completedAt: new Date().toISOString(),
                subtasks: (task.subtasks ?? []).map((entry) => ({ ...entry, done: false })),
            });
            toast.success(t("actions.taskDoneNext", { date: formatDate(next) }));
            return;
        }
        await store.update(task.id, { status: "done", completedAt: new Date().toISOString() });
        toast.success(t("actions.taskDone"), {
            action: { label: t("common.undo"), onClick: () => store.update(task.id, { status: task.status, completedAt: null }).catch(reportError) },
        });
    });
}

export const toggleRead = (link) => safely(() => store.update(link.id, { read: !link.read }));

export const togglePin = (item) =>
    safely(async () => {
        await store.update(item.id, { pinned: !item.pinned });
        toast.info(item.pinned ? t("actions.unpinned") : t("actions.pinned"));
    });

export const toggleFavorite = (item) => safely(() => store.update(item.id, { favorite: !item.favorite }));

export const toggleChecklistEntry = (item, key, entryId) =>
    safely(() =>
        store.update(item.id, {
            [key]: item[key].map((entry) => (entry.id === entryId ? { ...entry, done: !entry.done } : entry)),
        })
    );

/** Savatga tashlaydi va "Qaytarish" imkonini beradi */
export function trashItem(item) {
    return safely(async () => {
        await store.trash(item.id);
        toast(t("actions.trashed", { title: displayTitle(item) }), {
            action: { label: t("common.undo"), onClick: () => store.restore(item.id).catch(reportError) },
        });
        return true;
    });
}

export const restoreItem = (item) =>
    safely(async () => {
        await store.restore(item.id);
        toast.success(t("actions.restored", { title: displayTitle(item) }));
    });

export const purgeItem = (item) => safely(() => store.purge(item.id));

export function duplicateItem(item) {
    return safely(async () => {
        const { id, createdAt, updatedAt, trashedAt, ...data } = structuredClone(item);
        const copy = await store.create(item.type, { ...data, title: t("actions.copyTitle", { title: item.title || displayTitle(item) }), pinned: false });
        toast.success(t("actions.duplicated"));
        return copy;
    });
}
