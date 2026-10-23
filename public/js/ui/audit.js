/**
 * Xavfsizlik jurnali hodisalarining nomi va ikonkasi (sozlamalar va admin panel uchun umumiy).
 * Nomlar — "audit.<hodisa>" tarjima kalitlari.
 */
import { t } from "../core/i18n.js";

const AUDIT_ICONS = {
    register: "fa-user-plus",
    login: "fa-right-to-bracket",
    login_failed: "fa-triangle-exclamation",
    login_blocked: "fa-ban",
    logout: "fa-right-from-bracket",
    password_changed: "fa-key",
    recovery_rotated: "fa-rotate",
    recovery_used: "fa-life-ring",
    recovery_failed: "fa-triangle-exclamation",
    session_revoked: "fa-ban",
    account_disabled: "fa-user-lock",
    account_enabled: "fa-user-check",
    sessions_revoked_by_admin: "fa-plug-circle-xmark",
};

/** Barcha ma'lum hodisalar (admin paneldagi filtr uchun) */
export const AUDIT_EVENTS = Object.keys(AUDIT_ICONS);

/** Ogohlantiruvchi (qizil) ko'rsatiladigan hodisalar */
export const WARNING_EVENTS = new Set(["login_failed", "login_blocked", "recovery_failed", "account_disabled"]);

/** @returns {[string, string]} [ikonka, joriy tildagi nom] */
export const auditLabel = (event) => (event in AUDIT_ICONS ? [AUDIT_ICONS[event], t(`audit.${event}`)] : ["fa-circle", event]);
