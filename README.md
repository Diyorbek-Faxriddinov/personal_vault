# Shaxsiy Vault

**English** · [O'zbekcha](README.uz.md)

An **end-to-end encrypted** personal vault for plans, projects, links, study plans, a journal and secrets. Everything lives in one place, is quick to find, and the app gives you useful advice. (*Shaxsiy* means "personal" in Uzbek.)

The server and MySQL only ever see encrypted blobs. Neither your master password nor the key that decrypts your data ever leaves the browser.

The interface is available in three languages: **English**, **Uzbek** and **Russian**.

---

## Screenshots

![Home dashboard](screenshots/homepage.png)

| Sign in | Sign up | Admin panel |
|---|---|---|
| ![Sign in](screenshots/sign_in.png) | ![Sign up](screenshots/sign_up.png) | ![Admin panel](screenshots/admin_panel.png) |

---

## Features

| Section | What's included |
|---|---|
| **Home** | Today's focus, next 7 days, statistics, insights, active projects and learning progress, weekly mood |
| **Quick capture** | Creates an item from a single line: `Report tomorrow ! #work` → a task (due tomorrow, high priority, tagged). A URL → a link. Understands `today`, `tomorrow`, `day after tomorrow`, weekdays, `!` / `!!`, `#tag`, and prefixes such as `note:` / `journal:`. Keywords work in all three languages (`ertaga`, `завтра`, `dushanba`, `понедельник`, `fikr:`, `задача:` ...) |
| **Tasks** | Status, priority, due date, recurrence (daily/weekly/monthly), subtasks, linking to a project; "Overdue / Today / Tomorrow / This week" groups |
| **Projects** | Goal, deadline, link; progress is calculated automatically from linked tasks |
| **Learning** | Course/book/video/topic, milestones, time spent (+30 min), target date, notes |
| **Links** | Collections, read/unread, description |
| **Notes** | Markdown editor (toolbar, preview mode, Ctrl+B/I) |
| **Journal** | Mood, gratitude, streaks, a 20-week heatmap |
| **Secrets** | Username/password, password generator, strength meter, copy to clipboard |
| **Advisor** | Rule-based insights (overdue tasks, idle projects, weak/reused passwords, backup reminders...) — computed **entirely in the browser**. Optional **AI advisor** (Claude) — only with your consent |
| **Search** | `Ctrl+K` command palette, `#tag` filter, tolerant of Uzbek apostrophes (`o'qish` = `oqish`) |
| **Tags** | Connect all sections; rename, merge, delete |
| **Trash** | Restore deleted items or delete them permanently, "Undo" |
| **Language** | English, O'zbekcha, Русский. Choose it on the sign-in screen or in Settings → Appearance; the page is redrawn in the new language instantly (the vault stays unlocked). On first visit the language is detected from the browser. Server error messages also come back in the chosen language |
| **Settings** | Language, theme, auto-lock, change master password, renew recovery key, active sessions, security log, backups (encrypted / JSON / Markdown) and import, account deletion |

**Keyboard:** `Ctrl+K` search · `Ctrl+Shift+L` lock · `Ctrl+S` save · `Esc` cancel · `E` edit · in lists `/` search, `N` new item.

---

## Installation (Windows + MySQL 8)

Requirements: **Node.js 20.12+**, **MySQL 8** (running).

```powershell
npm install          # dependencies
npm run init         # creates .env (generates APP_SECRET and the app's DB password)
```

Open the `.env` file and put your MySQL `root` password into **`DB_ADMIN_PASSWORD`**. Then:

```powershell
npm run db:setup     # creates the "shaxsiy_vault" database and a restricted "vault_app" user
npm start            # http://127.0.0.1:3000
```

> After `db:setup` it's recommended to remove the `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` lines from `.env` — the app works without them.

Development mode (the server restarts when code changes): `npm run dev`.

### Admin panel

1. Put the admin email(s) into `.env`: `ADMIN_EMAILS=you@example.com` (separate several with commas).
2. Restart the server and sign up (or sign in) in the app **with that email**.
3. **Admin panel** appears in the sidebar (`/admin`).

The admin panel provides:
- **Statistics:** users, activity, encrypted data and database size, failed sign-ins.
- **Users:** search; each user's item count, storage size and sessions.
- **Account management:**
  - block (signed out of all devices, can't sign in again) and unblock;
  - sign out of all devices;
  - delete (confirmed by typing the email).
- **Security log:** across all users; filter by event type and by user.

> Even an admin **can't read users' items** — they are encrypted with each user's master password. Admins can't block or delete themselves or other admins.

### Enabling the AI advisor (optional)

1. Get an API key at [platform.claude.com](https://platform.claude.com).
2. Add it to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
3. Restart the server, then give your consent on the **Advisor** page in the app.

Model: `claude-opus-5-5` (can be changed with `AI_MODEL`). A server-side fallback model (`fallbacks: "default"`) is enabled for declined requests.

---

## Security model

```
 master password ──PBKDF2-SHA256 (600 000)──▶ master key
                                               ├─HKDF "auth"──▶ authKey ──▶ server (only a scrypt hash is stored)
                                               └─HKDF "wrap"──▶ wrapKey ──▶ unwraps the DEK (never leaves the browser)

 DEK (random 256-bit, in memory, non-exportable)
   └─AES-256-GCM──▶ every item (AAD = item id), settings

 recovery key (256-bit, 52 characters) ──HKDF──▶ a second encrypted copy of the DEK
```

- **Zero-knowledge:** nothing about an item — type, title, text, tags — is stored in plain form in MySQL. This is verified by a test.
- **If you forget your master password**, only the **recovery key** given at sign-up can help. The server can't reset your password.
- **Changing the password** doesn't re-encrypt items (the DEK stays the same and is only re-wrapped); sessions on other devices are signed out.
- **Sessions:** `httpOnly` + `SameSite=Strict` cookie; the database stores only a SHA-256 hash of the token. Reloading the page or exceeding the inactivity timeout locks the vault (the key is wiped from memory).
- **Defense layers:** strict CSP (no inline scripts or external CDNs), CSRF header + Origin check, rate limiting (brute force), Zod validation, parameterized SQL, every query scoped by `user_id`, XSS-free DOM (`h()`), safe Markdown, `javascript:` links blocked.
- **No email enumeration:** `prelogin` returns a stable fake salt for unknown emails, and comparisons take constant time.
- **Security log:** sign-ins, failed attempts, password/recovery key changes.
- **AI:** only with consent; you choose which sections are sent and can preview them first. Passwords are never sent and nothing is stored on the server. The AI replies in the language of your question (or the interface language if unclear).
- **The language choice** is not secret: it is stored in the browser's `localStorage` (`vault:lang`) so the sign-in screen opens in the chosen language too.

> **When exposing the app to the internet**, always use HTTPS (`NODE_ENV=production` makes the cookie `Secure` and enables HSTS). Behind Nginx, set `TRUST_PROXY=true`.

---

## Architecture

```
server/                         Node.js + Express 5 + MySQL (mysql2)
├── index.js                    startup, migrations, session cleanup, graceful shutdown
├── app.js                      Express app (also used by the tests)
├── config.js                   .env → configuration validated with Zod
├── db/                         pool, transactions, migrations (migrations/*.sql), setup
├── lib/                        errors, cryptography, validation, shared schemas, HTTP helpers, i18n (server messages)
├── middleware/                 session, CSRF, rate limit, security headers, error handling
└── modules/                    each module: routes → controller → service → repository (+ schemas)
    ├── auth/                   sign-up, prelogin, sign-in/out, recovery with the recovery key
    ├── account/                password, recovery key, settings, sessions, log, account deletion
    ├── items/                  encrypted items: CRUD, versioning (optimistic locking), sync, import
    ├── ai/                     SSE streaming with Claude
    ├── admin/                  admin panel: statistics, user management, global log
    ├── sessions/ users/ audit/

public/                         Vanilla JS SPA (ES modules, no build step)
├── js/core/                    crypto (WebCrypto), vault (key), store (items), api, router, idle, events, i18n (language)
├── js/locales/                 translations: en.js · uz.js · ru.js
├── js/models/types.js          item type registry — forms and lists are built from it
├── js/services/                auth flows, settings, search, insights, analytics, quick capture, backup, AI
├── js/ui/                      DOM helpers, fields, card, dialog, toast, markdown, palette...
├── js/views/                   pages: shell, auth, dashboard, collection, item, tags, trash, advisor, settings
└── css/                        base (tokens, themes) · layout · components · views

tests/                          node:test — cryptography, services, translations, full API integration
```

**Adding a new item type** — add one object (fields, defaults, filters) to `public/js/models/types.js`; the form, list, search and backup work automatically. Add a renderer to `ui/item-card.js` for its card view. Add the type's names (`types.<type>.label`, `.plural`, `.new` ...) to all three dictionaries.

### Translations (i18n)

- **Frontend:** all text goes through `t("key")` (`public/js/core/i18n.js`); dictionaries are in `public/js/locales/{en,uz,ru}.js`. Parameters: `t("common.itemsCount", { count: 3 })`. Plural forms are picked with `Intl.PluralRules`: `{ one, other }` in English, `{ one, few, many, other }` in Russian, a plain string in Uzbek. A missing key falls back to English.
- **Dates:** `Intl.DateTimeFormat` for English and Russian, custom formats for Uzbek (`ui/format.js`).
- **Server:** errors are created with a key (`errors.invalidLogin`) and `server/lib/i18n.js` translates them into the request language: the `X-Vault-Lang` header (sent by the app with every request) → `Accept-Language` → English.
- **Adding a language:** add a dictionary to `public/js/locales/`, an entry to `LANGUAGES` in `core/i18n.js`, and messages to `server/lib/i18n.js`. `npm test` checks that every dictionary has the same keys and `{parameters}`.

### API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/prelogin` | KDF salt and iterations |
| POST | `/api/auth/register` · `/login` · `/logout` | account, sign in, sign out |
| GET | `/api/auth/me` | current account + encrypted DEK |
| POST | `/api/auth/recovery/challenge` · `/reset` | recovery with the recovery key |
| GET / POST | `/api/items` (`?since=`) | items (full or incremental sync) |
| PUT / DELETE | `/api/items/:id` | update (with `version`, 409 on conflict) / delete |
| POST | `/api/items/batch` | import (up to 500) |
| PUT | `/api/account/password` · `/recovery` · `/settings` | account settings |
| GET / DELETE | `/api/account/sessions[/:id]` | sessions |
| GET | `/api/account/activity` | security log |
| DELETE | `/api/account` | delete account |
| GET / POST | `/api/ai/status` · `/api/ai/chat` | AI status / SSE chat |
| GET | `/api/admin/stats` · `/api/admin/users` · `/api/admin/audit` | admin: statistics, users, log |
| POST / DELETE | `/api/admin/users/:id/disable` · `/enable` · `/sessions` · `/:id` | admin: block, unblock, sign out, delete |

Every state-changing request must carry the `X-Vault-Request: 1` header. The optional `X-Vault-Lang: en|uz|ru` header sets the language of error messages.

---

## Tests

```powershell
npm test
```

The tests run against a **separate** `shaxsiy_vault_test` database and recreate it from scratch every time (the main database is never touched; they refuse to run if the name doesn't end with `_test`). They cover: encryption, AAD binding, the recovery key, sign-up/sign-in, IDOR protection, version conflicts, sync, import, password change, recovery, sessions, account deletion, CSRF, CSP, search, insights, quick capture (keywords in all three languages), Markdown XSS, and translations: identical keys and parameters across all three dictionaries, every key used in code exists, plural forms, and server messages returned in the requested language.

## Limitations

- File (image, PDF) attachments are not supported yet.
- Search runs in the browser (for privacy). It's fast up to tens of thousands of items and may slow down beyond that.
- No offline mode: a connection to the server is required.
- The interface and API messages are trilingual; the server console (logs) and the output of the `npm run init` / `db:setup` scripts are in Uzbek.
- The language choice is per device (`localStorage`) and isn't synced to other devices with the account.

## License

[MIT](LICENSE) © 2026 Diyorbek Faxriddinov
