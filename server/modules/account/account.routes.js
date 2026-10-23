import { Router } from "express";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { authLimiter } from "../../middleware/rate-limit.js";
import { accountController } from "./account.controller.js";
import { accountSchemas } from "./account.schemas.js";

export const accountRoutes = Router();

accountRoutes.use(requireAuth);

accountRoutes.put("/password", authLimiter, validate({ body: accountSchemas.changePassword }), accountController.changePassword);
accountRoutes.put("/recovery", authLimiter, validate({ body: accountSchemas.rotateRecovery }), accountController.rotateRecovery);
accountRoutes.put("/settings", validate({ body: accountSchemas.settings }), accountController.saveSettings);
accountRoutes.delete("/", authLimiter, validate({ body: accountSchemas.deleteAccount }), accountController.deleteAccount);

accountRoutes.get("/sessions", accountController.listSessions);
accountRoutes.delete("/sessions", accountController.revokeOtherSessions);
accountRoutes.delete("/sessions/:id", validate({ params: accountSchemas.sessionParams }), accountController.revokeSession);

accountRoutes.get("/activity", accountController.listActivity);
