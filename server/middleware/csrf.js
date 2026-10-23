/**
 * CSRF himoyasi (cookie SameSite=Strict ustiga qo'shimcha qatlam).
 *
 * Ma'lumotni o'zgartiruvchi har bir so'rovda maxsus sarlavha bo'lishi shart. Boshqa saytlar
 * bunday sarlavhani CORS ruxsatisiz yubora olmaydi, biz esa CORS'ni yoqmaganmiz.
 * Origin sarlavhasi bo'lsa, u bizning hostimiz bilan mos kelishi kerak.
 */
import { forbidden } from "../lib/errors.js";

export const CSRF_HEADER = "x-vault-request";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    if (req.get(CSRF_HEADER) !== "1") throw forbidden("errors.csrf");

    const origin = req.get("origin");
    if (origin) {
        let originHost = null;
        try {
            originHost = new URL(origin).host;
        } catch {
            /* noto'g'ri Origin */
        }
        if (originHost !== req.get("host")) throw forbidden("errors.foreignOrigin");
    }
    next();
}
