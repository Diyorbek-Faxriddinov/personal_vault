import { Router } from "express";
import { z } from "zod";
import { positiveId } from "../../lib/schemas.js";
import { validate } from "../../lib/validate.js";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { adminController } from "./admin.controller.js";

const schemas = {
    userParams: z.object({ id: positiveId }),
    usersQuery: z.object({
        query: z.string().trim().max(254).default(""),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
    auditQuery: z.object({
        event: z.string().regex(/^[a-z_]{1,40}$/).optional(),
        userId: positiveId.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
    }),
};

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get("/stats", adminController.stats);
adminRoutes.get("/users", validate({ query: schemas.usersQuery }), adminController.listUsers);
adminRoutes.post("/users/:id/disable", validate({ params: schemas.userParams }), adminController.disableUser);
adminRoutes.post("/users/:id/enable", validate({ params: schemas.userParams }), adminController.enableUser);
adminRoutes.delete("/users/:id/sessions", validate({ params: schemas.userParams }), adminController.revokeSessions);
adminRoutes.delete("/users/:id", validate({ params: schemas.userParams }), adminController.deleteUser);
adminRoutes.get("/audit", validate({ query: schemas.auditQuery }), adminController.listAudit);
