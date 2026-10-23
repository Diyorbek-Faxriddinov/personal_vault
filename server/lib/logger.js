/**
 * Minimal logger. Test rejimida jim turadi.
 * Diqqat: hech qachon so'rov tanasini (body) loglamang — unda shifrlangan ma'lumot va kalitlar bor.
 */
const silent = process.env.NODE_ENV === "test";

function write(level, message, meta) {
    if (silent) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}`;
    const output = level === "error" ? console.error : console.log;
    meta === undefined ? output(line) : output(line, meta);
}

export const logger = {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
};
