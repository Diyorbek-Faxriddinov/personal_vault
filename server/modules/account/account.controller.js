import { clearSessionCookie, requestMeta } from "../../lib/http.js";
import { accountService } from "./account.service.js";

export const accountController = {
    async changePassword(req, res) {
        await accountService.changePassword(req.session, req.valid.body, requestMeta(req));
        res.status(204).end();
    },

    async rotateRecovery(req, res) {
        await accountService.rotateRecovery(req.session, req.valid.body, requestMeta(req));
        res.status(204).end();
    },

    async saveSettings(req, res) {
        await accountService.saveSettings(req.session, req.valid.body.encryptedSettings);
        res.status(204).end();
    },

    async deleteAccount(req, res) {
        await accountService.deleteAccount(req.session, req.valid.body.currentAuthKey);
        clearSessionCookie(res);
        res.status(204).end();
    },

    async listSessions(req, res) {
        res.json({ sessions: await accountService.listSessions(req.session) });
    },

    async revokeSession(req, res) {
        await accountService.revokeSession(req.session, req.valid.params.id, requestMeta(req));
        res.status(204).end();
    },

    async revokeOtherSessions(req, res) {
        res.json({ revoked: await accountService.revokeOtherSessions(req.session, requestMeta(req)) });
    },

    async listActivity(req, res) {
        res.json({ events: await accountService.listActivity(req.session) });
    },
};
