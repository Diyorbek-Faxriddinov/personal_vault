import { itemsService } from "./items.service.js";

export const itemsController = {
    async list(req, res) {
        res.json(await itemsService.list(req.session.userId, req.valid.query.since));
    },

    async create(req, res) {
        res.status(201).json(await itemsService.create(req.session.userId, req.valid.body));
    },

    async update(req, res) {
        res.json(await itemsService.update(req.session.userId, req.valid.params.id, req.valid.body));
    },

    async remove(req, res) {
        await itemsService.remove(req.session.userId, req.valid.params.id);
        res.status(204).end();
    },

    async batchCreate(req, res) {
        res.json(await itemsService.batchCreate(req.session.userId, req.valid.body.items));
    },
};
