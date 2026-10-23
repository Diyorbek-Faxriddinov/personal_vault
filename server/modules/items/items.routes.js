import express, { Router } from "express";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { itemsController } from "./items.controller.js";
import { itemsSchemas as s } from "./items.schemas.js";

export const itemsRoutes = Router();

itemsRoutes.use(requireAuth);

itemsRoutes.get("/", validate({ query: s.listQuery }), itemsController.list);
itemsRoutes.post("/", validate({ body: s.create }), itemsController.create);
// Import paytida ko'p yozuv bir so'rovda keladi — shu yo'l uchun kattaroq chegara
itemsRoutes.post("/batch", express.json({ limit: "50mb" }), validate({ body: s.batch }), itemsController.batchCreate);
itemsRoutes.put("/:id", validate({ params: s.idParams, body: s.update }), itemsController.update);
itemsRoutes.delete("/:id", validate({ params: s.idParams }), itemsController.remove);
