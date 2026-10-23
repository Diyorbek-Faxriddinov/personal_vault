import { clearSessionCookie, getSessionToken, requestMeta, setSessionCookie } from "../../lib/http.js";
import { authService } from "./auth.service.js";

export const authController = {
    async prelogin(req, res) {
        res.json(await authService.prelogin(req.valid.body.email));
    },

    async register(req, res) {
        const { session, account } = await authService.register(req.valid.body, requestMeta(req));
        setSessionCookie(res, session);
        res.status(201).json(account);
    },

    async login(req, res) {
        const { session, account } = await authService.login(req.valid.body, requestMeta(req));
        setSessionCookie(res, session);
        res.json(account);
    },

    async logout(req, res) {
        const token = getSessionToken(req);
        if (token) await authService.logout(req.session, token, requestMeta(req));
        clearSessionCookie(res);
        res.status(204).end();
    },

    async me(req, res) {
        res.json(await authService.getAccount(req.session.userId));
    },

    async recoveryChallenge(req, res) {
        res.json(await authService.recoveryChallenge(req.valid.body, requestMeta(req)));
    },

    async recoveryReset(req, res) {
        const { session, account } = await authService.recoveryReset(req.valid.body, requestMeta(req));
        setSessionCookie(res, session);
        res.json(account);
    },
};
