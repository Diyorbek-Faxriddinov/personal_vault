/**
 * HTTP xavfsizlik sarlavhalari (helmet).
 * CSP qat'iy: faqat o'z serverimizdagi skript va stillar. Inline skript yo'q, tashqi CDN yo'q —
 * shu sababli XSS bo'lgan taqdirda ham shifrlangan ma'lumot begona serverga yuborilmaydi.
 */
import helmet from "helmet";
import { config } from "../config.js";

export const securityHeaders = () =>
    helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'"],
                fontSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "blob:"],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
            },
        },
        strictTransportSecurity: config.isProduction,
        crossOriginEmbedderPolicy: false,
        referrerPolicy: { policy: "no-referrer" },
    });

/** API javoblari hech qayerda keshlanmasin */
export function noStore(_req, res, next) {
    res.set("Cache-Control", "no-store");
    next();
}
