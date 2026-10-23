/**
 * Zod sxemasi bo'yicha so'rovni tekshiruvchi middleware.
 * Tekshirilgan (va tozalangan) qiymatlar req.valid.{body,query,params} ga yoziladi.
 */
import { badRequest } from "./errors.js";

export function validate(schemas) {
    return (req, _res, next) => {
        req.valid = {};
        for (const part of ["params", "query", "body"]) {
            if (!schemas[part]) continue;
            const result = schemas[part].safeParse(req[part] ?? {});
            if (!result.success) {
                const fields = result.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                }));
                throw badRequest("errors.invalidRequest", fields);
            }
            req.valid[part] = result.data;
        }
        next();
    };
}
