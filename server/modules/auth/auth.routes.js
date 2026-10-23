import { Router } from "express";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { authLimiter } from "../../middleware/rate-limit.js";
import { authController } from "./auth.controller.js";
import { authSchemas } from "./auth.schemas.js";

export const authRoutes = Router();

authRoutes.post("/prelogin", authLimiter, validate({ body: authSchemas.prelogin }), authController.prelogin);
authRoutes.post("/register", authLimiter, validate({ body: authSchemas.register }), authController.register);
authRoutes.post("/login", authLimiter, validate({ body: authSchemas.login }), authController.login);
authRoutes.post("/logout", authController.logout);
authRoutes.get("/me", requireAuth, authController.me);

authRoutes.post(
    "/recovery/challenge",
    authLimiter,
    validate({ body: authSchemas.recoveryChallenge }),
    authController.recoveryChallenge
);
authRoutes.post(
    "/recovery/reset",
    authLimiter,
    validate({ body: authSchemas.recoveryReset }),
    authController.recoveryReset
);
