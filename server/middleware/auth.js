import { forbidden, unauthorized } from "../lib/errors.js";
import { getSessionToken } from "../lib/http.js";
import { isAdminEmail } from "../modules/auth/auth.service.js";
import { sessionsService } from "../modules/sessions/sessions.service.js";
import { usersRepository } from "../modules/users/users.repository.js";

/** Har bir API so'rovida cookie'dan sessiyani aniqlaydi: req.session = { id, userId } | null */
export async function loadSession(req, _res, next) {
    req.session = await sessionsService.resolve(getSessionToken(req));
    next();
}

export function requireAuth(req, _res, next) {
    if (!req.session) throw unauthorized();
    next();
}

/** Admin — .env dagi ADMIN_EMAILS ro'yxatidagi email egasi. Har so'rovda bazadan tekshiriladi. */
export async function requireAdmin(req, _res, next) {
    const user = await usersRepository.findById(req.session.userId);
    if (!user || !isAdminEmail(user.email)) throw forbidden("errors.adminOnly");
    next();
}
