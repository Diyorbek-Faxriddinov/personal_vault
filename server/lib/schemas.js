/**
 * Bir nechta modulda ishlatiladigan Zod sxemalari.
 * Server shifrlangan ma'lumot ichini bilmaydi, lekin uning formatini qat'iy tekshiradi.
 */
import { z } from "zod";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Brauzerdagi crypto.js formati: "v1.<iv base64>.<ciphertext base64>" */
const ENCRYPTED = /^v1\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}$/;

export const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("validation.email").max(254));

/** 32 baytli kalit (base64 da 44 belgi) */
export const key256 = z.string().length(44).regex(BASE64, "validation.key");

export const kdfSalt = z.string().length(24).regex(BASE64, "validation.salt");

export const kdfIterations = z.number().int().min(100_000).max(10_000_000);

export const encrypted = (maxLength) =>
    z.string().max(maxLength).regex(ENCRYPTED, "validation.encrypted");

export const uuid = z.uuid("validation.uuid");

export const positiveId = z.coerce.number().int().positive();
