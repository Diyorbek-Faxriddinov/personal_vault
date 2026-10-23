import { Router } from "express";
import { z } from "zod";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { aiLimiter } from "../../middleware/rate-limit.js";
import { aiController } from "./ai.controller.js";

const message = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(20_000),
});

const chatSchema = z.object({
    messages: z
        .array(message)
        .min(1)
        .max(40)
        .refine((list) => list[0].role === "user" && list.at(-1).role === "user", {
            message: "validation.chatOrder",
        }),
    context: z.string().max(60_000).optional(),
});

export const aiRoutes = Router();

aiRoutes.use(requireAuth);
aiRoutes.get("/status", aiController.status);
aiRoutes.post("/chat", aiLimiter, validate({ body: chatSchema }), aiController.chat);
