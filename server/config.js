/**
 * Ilova konfiguratsiyasi: .env faylidan o'qiladi va ishga tushishdan oldin tekshiriladi.
 * Noto'g'ri sozlama bilan server umuman ishga tushmaydi — xatolar darhol ko'rinadi.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envFile = process.env.ENV_FILE || path.join(ROOT_DIR, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const bool = z
    .enum(["true", "false", "1", "0"])
    .transform((value) => value === "true" || value === "1");

const schema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY: bool.default(false),

    APP_SECRET: z.string().min(32, "APP_SECRET kamida 32 belgidan iborat bo'lishi kerak (npm run init)"),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(168),

    DB_HOST: z.string().default("127.0.0.1"),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_NAME: z.string().regex(/^[A-Za-z0-9_]+$/, "DB_NAME faqat harf, raqam va _ dan iborat bo'lsin"),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(""),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

    // Vergul bilan ajratilgan emaillar: shu hisoblar admin panelga kira oladi
    ADMIN_EMAILS: z.string().default(""),

    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-opus-5-5"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`);
    console.error(`\n.env sozlamalarida xato:\n${problems.join("\n")}\n\nYordam: README.uz.md → "O'rnatish" bo'limi (inglizcha: README.md → "Installation").\n`);
    process.exit(1);
}

const env = parsed.data;

export const config = Object.freeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    host: env.HOST,
    port: env.PORT,
    trustProxy: env.TRUST_PROXY,
    appSecret: env.APP_SECRET,
    session: {
        cookieName: "vault_sid",
        ttlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
        touchIntervalMs: 5 * 60 * 1000,
    },
    db: {
        host: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        connectionLimit: env.DB_CONNECTION_LIMIT,
    },
    adminEmails: new Set(
        env.ADMIN_EMAILS.split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean)
    ),
    ai: {
        enabled: Boolean(env.ANTHROPIC_API_KEY),
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.AI_MODEL,
    },
    limits: {
        itemCiphertextChars: 2_000_000,
        itemsPerUser: 50_000,
        batchSize: 500,
    },
    publicDir: path.join(ROOT_DIR, "public"),
});
