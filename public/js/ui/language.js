/**
 * Til tanlash ro'yxati (kirish ekranlari va sozlamalar uchun).
 * Tanlov darhol qo'llanadi: main.js joriy sahifani yangi tilda qayta chizadi.
 */
import { getLanguage, LANGUAGES, setLanguage, t } from "../core/i18n.js";
import { h } from "./dom.js";

export function languageSelect({ className, onChange } = {}) {
    return h(
        "select",
        {
            class: ["input select", className],
            "aria-label": t("settings.language"),
            onChange: (event) => {
                setLanguage(event.target.value);
                onChange?.(event.target.value);
            },
        },
        LANGUAGES.map((language) => h("option", { value: language.code, lang: language.code, selected: language.code === getLanguage() }, language.label))
    );
}
