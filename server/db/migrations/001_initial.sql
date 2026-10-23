-- Foydalanuvchilar.
-- Server master parolni ham, ma'lumotlarni ochadigan kalitni ham bilmaydi:
--   auth_hash      — brauzerda paroldan hosil qilingan "authKey"ning scrypt xeshi
--   wrapped_key    — ma'lumot kaliti (DEK), paroldan hosil qilingan kalit bilan shifrlangan
--   recovery_*     — xuddi shu DEK, tiklash kaliti bilan shifrlangan (parol unutilganda)
CREATE TABLE users (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email                 VARCHAR(255)    NOT NULL,
    auth_hash             VARCHAR(255)    NOT NULL,
    kdf_salt              VARCHAR(64)     NOT NULL,
    kdf_iterations        INT UNSIGNED    NOT NULL,
    wrapped_key           TEXT CHARACTER SET ascii NOT NULL,
    recovery_auth_hash    VARCHAR(255)    NOT NULL,
    recovery_wrapped_key  TEXT CHARACTER SET ascii NOT NULL,
    encrypted_settings    MEDIUMTEXT CHARACTER SET ascii NULL,
    created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    last_login_at         DATETIME(3)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Sessiyalar. Cookie'dagi tokenning o'zi emas, faqat SHA-256 xeshi saqlanadi.
CREATE TABLE sessions (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    token_hash    BINARY(32)      NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,
    ip            VARCHAR(45)     NULL,
    user_agent    VARCHAR(255)    NULL,
    created_at    DATETIME(3)     NOT NULL,
    last_seen_at  DATETIME(3)     NOT NULL,
    expires_at    DATETIME(3)     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_token (token_hash),
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_expires (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Yozuvlar (eslatma, vazifa, loyiha, havola, o'qish rejasi, kundalik, maxfiy ma'lumot).
-- Turi, sarlavhasi, matni — hammasi ciphertext ichida. Server faqat shifrlangan blokni ko'radi.
-- deleted_at — boshqa qurilmalar sinxronlashi uchun "o'chirildi" belgisi (tombstone).
CREATE TABLE items (
    id          CHAR(36) CHARACTER SET ascii NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    ciphertext  MEDIUMTEXT CHARACTER SET ascii NOT NULL,
    version     INT UNSIGNED    NOT NULL DEFAULT 1,
    created_at  DATETIME(3)     NOT NULL,
    updated_at  DATETIME(3)     NOT NULL,
    deleted_at  DATETIME(3)     NULL,
    PRIMARY KEY (user_id, id),
    KEY idx_items_sync (user_id, updated_at),
    CONSTRAINT fk_items_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Xavfsizlik jurnali: kirishlar, muvaffaqiyatsiz urinishlar, parol almashtirish va h.k.
CREATE TABLE audit_log (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    event       VARCHAR(40)     NOT NULL,
    ip          VARCHAR(45)     NULL,
    user_agent  VARCHAR(255)    NULL,
    created_at  DATETIME(3)     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_audit_user (user_id, created_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
