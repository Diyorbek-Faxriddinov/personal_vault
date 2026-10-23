/**
 * Server xabarlarining tarjimalari (en / uz / ru).
 *
 * Xatolar kalit bilan yaratiladi (masalan, errors.invalidLogin), error-handler esa ularni so'rov tiliga
 * o'giradi. Til: brauzer yuboradigan X-Vault-Lang sarlavhasi → Accept-Language → ingliz tili.
 */
export const LANGUAGES = ["en", "uz", "ru"];
export const DEFAULT_LANGUAGE = "en";

const MESSAGES = {
    en: {
        "errors.unauthorized": "Please sign in first",
        "errors.forbidden": "Access denied",
        "errors.notFound": "Not found",
        "errors.invalidRequest": "Invalid request data",
        "errors.payloadTooLarge": "Request is too large",
        "errors.badJson": "Invalid JSON",
        "errors.internal": "Unexpected server error",
        "errors.tooManyRequests": "Too many attempts. Please try again later.",
        "errors.apiNotFound": "API endpoint not found: {method} {url}",
        "errors.csrf": "Request rejected (CSRF)",
        "errors.foreignOrigin": "Request came from another origin",
        "errors.adminOnly": "This section is for administrators only",
        "errors.invalidLogin": "Wrong email or master password",
        "errors.invalidRecovery": "Wrong email or recovery key",
        "errors.accountDisabled": "Your account has been blocked by an administrator",
        "errors.emailTaken": "An account with this email already exists",
        "errors.wrongCurrentPassword": "Current master password is incorrect",
        "errors.userNotFound": "User not found",
        "errors.cannotManageSelf": "You can't apply this action to your own account",
        "errors.cannotManageAdmin": "Admin accounts can't be managed (remove the email from ADMIN_EMAILS)",
        "errors.itemLimit": "You have reached the item limit ({limit})",
        "errors.itemExists": "An item with this ID already exists",
        "errors.itemGone": "Item not found or deleted",
        "errors.itemConflict": "This item was changed on another device",
        "errors.itemNotFound": "Item not found",
        "errors.sessionNotFound": "Session not found",
        "errors.aiDisabled": "The AI advisor is not configured. Add ANTHROPIC_API_KEY to the .env file and restart the server.",
        "validation.email": "Invalid email address",
        "validation.key": "Invalid key format",
        "validation.salt": "Invalid salt format",
        "validation.encrypted": "Invalid encrypted data format",
        "validation.uuid": "Invalid identifier",
        "validation.chatOrder": "The conversation must start and end with a user message",
        "ai.refusal": "This request couldn't be answered. Try rephrasing your question.",
        "ai.authentication": "ANTHROPIC_API_KEY is invalid or has been revoked.",
        "ai.permission": "This API key has no access to the model.",
        "ai.rateLimit": "The AI service hit its rate limit. Please try again later.",
        "ai.badRequest": "Request rejected: {detail}",
        "ai.connection": "Couldn't reach the Anthropic server. Check your internet connection.",
        "ai.apiError": "AI service error ({status}).",
        "ai.unexpected": "Unexpected error while getting the AI response.",
    },
    uz: {
        "errors.unauthorized": "Avval tizimga kiring",
        "errors.forbidden": "Ruxsat yo'q",
        "errors.notFound": "Topilmadi",
        "errors.invalidRequest": "So'rov ma'lumotlari noto'g'ri",
        "errors.payloadTooLarge": "So'rov hajmi juda katta",
        "errors.badJson": "JSON formati noto'g'ri",
        "errors.internal": "Serverda kutilmagan xatolik yuz berdi",
        "errors.tooManyRequests": "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.",
        "errors.apiNotFound": "API manzili topilmadi: {method} {url}",
        "errors.csrf": "So'rov rad etildi (CSRF)",
        "errors.foreignOrigin": "So'rov boshqa manbadan keldi",
        "errors.adminOnly": "Bu bo'lim faqat administratorlar uchun",
        "errors.invalidLogin": "Email yoki master parol noto'g'ri",
        "errors.invalidRecovery": "Email yoki tiklash kaliti noto'g'ri",
        "errors.accountDisabled": "Hisobingiz administrator tomonidan bloklangan",
        "errors.emailTaken": "Bu email bilan hisob allaqachon mavjud",
        "errors.wrongCurrentPassword": "Joriy master parol noto'g'ri",
        "errors.userNotFound": "Foydalanuvchi topilmadi",
        "errors.cannotManageSelf": "Bu amalni o'z hisobingizga qo'llab bo'lmaydi",
        "errors.cannotManageAdmin": "Admin hisobini boshqarib bo'lmaydi (ADMIN_EMAILS dan olib tashlang)",
        "errors.itemLimit": "Yozuvlar soni chegarasiga yetdingiz ({limit})",
        "errors.itemExists": "Bunday identifikatorli yozuv allaqachon mavjud",
        "errors.itemGone": "Yozuv topilmadi yoki o'chirilgan",
        "errors.itemConflict": "Yozuv boshqa qurilmada o'zgartirilgan",
        "errors.itemNotFound": "Yozuv topilmadi",
        "errors.sessionNotFound": "Sessiya topilmadi",
        "errors.aiDisabled": "AI maslahatchi sozlanmagan. .env fayliga ANTHROPIC_API_KEY qo'shing va serverni qayta ishga tushiring.",
        "validation.email": "Email manzil noto'g'ri",
        "validation.key": "Kalit formati noto'g'ri",
        "validation.salt": "Salt formati noto'g'ri",
        "validation.encrypted": "Shifrlangan ma'lumot formati noto'g'ri",
        "validation.uuid": "Identifikator noto'g'ri",
        "validation.chatOrder": "Suhbat foydalanuvchi xabari bilan boshlanib, u bilan tugashi kerak",
        "ai.refusal": "Bu so'rovga javob berib bo'lmadi. Savolni boshqacha ifodalab ko'ring.",
        "ai.authentication": "ANTHROPIC_API_KEY noto'g'ri yoki bekor qilingan.",
        "ai.permission": "Bu API kaliti uchun modelga ruxsat yo'q.",
        "ai.rateLimit": "AI xizmati so'rovlar chegarasiga yetdi. Birozdan so'ng urinib ko'ring.",
        "ai.badRequest": "So'rov rad etildi: {detail}",
        "ai.connection": "Anthropic serveriga ulanib bo'lmadi. Internetni tekshiring.",
        "ai.apiError": "AI xizmatida xatolik ({status}).",
        "ai.unexpected": "AI javobini olishda kutilmagan xatolik yuz berdi.",
    },
    ru: {
        "errors.unauthorized": "Сначала войдите в систему",
        "errors.forbidden": "Доступ запрещён",
        "errors.notFound": "Не найдено",
        "errors.invalidRequest": "Некорректные данные запроса",
        "errors.payloadTooLarge": "Слишком большой запрос",
        "errors.badJson": "Некорректный JSON",
        "errors.internal": "Непредвиденная ошибка сервера",
        "errors.tooManyRequests": "Слишком много попыток. Повторите позже.",
        "errors.apiNotFound": "API-адрес не найден: {method} {url}",
        "errors.csrf": "Запрос отклонён (CSRF)",
        "errors.foreignOrigin": "Запрос пришёл с другого источника",
        "errors.adminOnly": "Этот раздел доступен только администраторам",
        "errors.invalidLogin": "Неверный email или мастер-пароль",
        "errors.invalidRecovery": "Неверный email или ключ восстановления",
        "errors.accountDisabled": "Ваш аккаунт заблокирован администратором",
        "errors.emailTaken": "Аккаунт с таким email уже существует",
        "errors.wrongCurrentPassword": "Текущий мастер-пароль неверен",
        "errors.userNotFound": "Пользователь не найден",
        "errors.cannotManageSelf": "Это действие нельзя применить к собственному аккаунту",
        "errors.cannotManageAdmin": "Аккаунтами администраторов управлять нельзя (уберите email из ADMIN_EMAILS)",
        "errors.itemLimit": "Достигнут лимит записей ({limit})",
        "errors.itemExists": "Запись с таким идентификатором уже существует",
        "errors.itemGone": "Запись не найдена или удалена",
        "errors.itemConflict": "Запись была изменена на другом устройстве",
        "errors.itemNotFound": "Запись не найдена",
        "errors.sessionNotFound": "Сеанс не найден",
        "errors.aiDisabled": "AI-советник не настроен. Добавьте ANTHROPIC_API_KEY в файл .env и перезапустите сервер.",
        "validation.email": "Некорректный email",
        "validation.key": "Некорректный формат ключа",
        "validation.salt": "Некорректный формат соли",
        "validation.encrypted": "Некорректный формат зашифрованных данных",
        "validation.uuid": "Некорректный идентификатор",
        "validation.chatOrder": "Диалог должен начинаться и заканчиваться сообщением пользователя",
        "ai.refusal": "На этот запрос нельзя ответить. Попробуйте сформулировать вопрос иначе.",
        "ai.authentication": "ANTHROPIC_API_KEY неверен или отозван.",
        "ai.permission": "У этого API-ключа нет доступа к модели.",
        "ai.rateLimit": "AI-сервис достиг лимита запросов. Повторите позже.",
        "ai.badRequest": "Запрос отклонён: {detail}",
        "ai.connection": "Не удалось подключиться к серверу Anthropic. Проверьте интернет.",
        "ai.apiError": "Ошибка AI-сервиса ({status}).",
        "ai.unexpected": "Непредвиденная ошибка при получении ответа AI.",
    },
};

export const hasMessage = (key) => typeof key === "string" && key in MESSAGES[DEFAULT_LANGUAGE];

/** Kalitni tarjima qiladi; kalit topilmasa — matnning o'zini qaytaradi (masalan, Zod'ning standart xabari) */
export function translate(lang, key, params = {}) {
    const template = MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LANGUAGE][key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

const pick = (value) => {
    const code = String(value ?? "").trim().toLowerCase().slice(0, 2);
    return LANGUAGES.includes(code) ? code : null;
};

/** X-Vault-Lang (ilovada tanlangan til) → Accept-Language → standart til */
export function resolveLanguage(req) {
    const explicit = pick(req.get?.("x-vault-lang"));
    if (explicit) return explicit;
    for (const part of String(req.get?.("accept-language") ?? "").split(",")) {
        const code = pick(part.split(";")[0]);
        if (code) return code;
    }
    return DEFAULT_LANGUAGE;
}

/** Har bir API so'roviga req.lang qo'shadi */
export function detectLanguage(req, _res, next) {
    req.lang = resolveLanguage(req);
    next();
}

export { MESSAGES as SERVER_MESSAGES };
