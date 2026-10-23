import { requestMeta } from "../../lib/http.js";
import { adminService } from "./admin.service.js";

export const adminController = {
    async stats(_req, res) {
        res.json(await adminService.stats());
    },

    async listUsers(req, res) {
        res.json(await adminService.listUsers(req.valid.query));
    },

    async disableUser(req, res) {
        res.json(await adminService.setDisabled(req.session, req.valid.params.id, true, requestMeta(req)));
    },

    async enableUser(req, res) {
        res.json(await adminService.setDisabled(req.session, req.valid.params.id, false, requestMeta(req)));
    },

    async revokeSessions(req, res) {
        res.json({ revoked: await adminService.revokeSessions(req.session, req.valid.params.id, requestMeta(req)) });
    },

    async deleteUser(req, res) {
        await adminService.deleteUser(req.session, req.valid.params.id);
        res.status(204).end();
    },

    async listAudit(req, res) {
        res.json({ events: await adminService.listAudit(req.valid.query) });
    },
};
