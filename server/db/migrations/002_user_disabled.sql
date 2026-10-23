-- Admin foydalanuvchini bloklashi mumkin: bloklangan hisob tizimga kira olmaydi.
ALTER TABLE users
    ADD COLUMN disabled_at DATETIME(3) NULL AFTER last_login_at;
