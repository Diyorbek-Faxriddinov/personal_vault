/**
 * .env faylini .env.example asosida yaratadi va maxfiy qiymatlarni tasodifiy to'ldiradi.
 *   npm run init
 * Mavjud .env faylini hech qachon qayta yozmaydi.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".env");

if (fs.existsSync(target)) {
    console.log(".env allaqachon mavjud — o'zgartirilmadi.");
    process.exit(0);
}

const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const content = template
    .replace(/^APP_SECRET=.*$/m, `APP_SECRET=${crypto.randomBytes(48).toString("base64url")}`)
    .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${crypto.randomBytes(24).toString("base64url")}`);

fs.writeFileSync(target, content, { mode: 0o600 });
console.log(`✓ .env yaratildi: ${target}
  APP_SECRET va DB_PASSWORD (ilova foydalanuvchisi uchun) avtomatik yaratildi.

Keyingi qadamlar:
  1. .env faylida DB_ADMIN_PASSWORD ga MySQL root parolingizni yozing
  2. npm run db:setup
  3. npm start`);
