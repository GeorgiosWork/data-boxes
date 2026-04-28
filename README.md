| aries-ces | ⓒ 2026 Gios |
|--------------|--------------|

----------------------------------------------------
1. Struktura projektu
-----------------------------------------------------
```plaintext
aries-ces/
├── functions/
│   ├── api/
│   │   ├── _admin_session.js  # Helper: ověření admin session z cookie CF_SESSION
│   │   ├── _session.js        # Helper: ověření zaměstnanecké session z Bearer tokenu
│   │   ├── auth.js            # POST /api/auth — přihlášení zaměstnance (PIN + rate limiting)
│   │   ├── login.js           # POST /api/login — přihlášení admina (cookie session)
│   │   ├── logout.js          # GET  /api/logout — odhlášení admina
│   │   ├── upload.js          # POST /api/upload — nahrání dokumentu (pouze admin)
│   │   ├── download.js        # GET  /api/download — stažení dokumentu (pouze zaměstnanec)
│   │   ├── list.js            # GET  /api/list — seznam dokumentů (admin i zaměstnanec)
│   │   ├── delete.js          # POST /api/delete — smazání dokumentu (pouze admin)
│   │   └── pin.js             # GET/POST /api/pin — správa PINů zaměstnanců (pouze admin)
│   └── _middleware.js         # Ochrana /admin.html — ověření cookie CF_SESSION
├── public/
│   ├── admin.html             # Admin zóna (správa dokumentů a PINů)
│   ├── favicon.ico
│   ├── index.html             # Klientská zóna (přihlášení a dokumenty zaměstnance)
│   └── login.html             # Přihlašovací stránka admina
├── README.md
└── wrangler.toml
```

----------------------------------------------------
2. Autentizace a session
----------------------------------------------------

### Admin
- Přihlášení přes `POST /api/login` (uživatelské jméno + heslo z env proměnných)
- Session uložena v KV `ADMIN_ARIES_CES_SID` pod klíčem `admin_session:<token>`
- Token předáván jako HttpOnly cookie `CF_SESSION` (TTL 24 hodin)
- `_middleware.js` chrání `/admin.html` — nepřihlášený admin je přesměrován na `/login.html`
- Všechny admin API endpointy ověřují cookie přes sdílený helper `_admin_session.js`

### Zaměstnanec
- Přihlášení přes `POST /api/auth` (osobní číslo + PIN)
- PIN uložen v KV `USER_ARIES_CES_SID` jako SHA-256 hash se solí (`pin:<employeeId>`)
- Session uložena v KV `USER_ARIES_CES_SID` pod klíčem `session:<token>` (TTL 8 hodin)
- Token předáván v hlavičce `Authorization: Bearer <token>`
- Ověření session přes sdílený helper `_session.js`

### Rate limiting (`/api/auth`)
- Max 5 neúspěšných pokusů per IP za 15 minut
- Čítač uložen v KV `USER_ARIES_CES_SID` pod klíčem `ratelimit:<ip>`
- Po úspěšném přihlášení se čítač resetuje
- IP adresa čtena z hlavičky `CF-Connecting-IP` (vkládá Cloudflare)
- Při překročení limitu vrací HTTP 429 s hlavičkou `Retry-After: 900`

----------------------------------------------------
3. Nasazení na Cloudflare Pages
----------------------------------------------------

### wrangler.toml
```toml
name = "aries-ces-app"
compatibility_date = "2026-04-05"
pages_build_output_dir = "public"

[[r2_buckets]]
binding = "R2"
bucket_name = "aries-ces-bucket"

[[kv_namespaces]]
binding = "USER_ARIES_CES_SID"
id = "c498c80b8f154ec583ca902139e34733"

[[kv_namespaces]]
binding = "ADMIN_ARIES_CES_SID"
id = "6ee872da307a487ca87132f9403d911d"
```

### Environment variables
Nastavit v Cloudflare dashboard: **Settings → Environment variables → Production**

| Proměnná | Popis | Povinná |
|---|---|---|
| `VALID_USER_1` | Uživatelské jméno admina | ✅ |
| `VALID_PASS_1` | Heslo admina | ✅ |
| `VALID_USER_2` | Uživatelské jméno druhého admina | ➖ |
| `VALID_PASS_2` | Heslo druhého admina | ➖ |
| `ADMIN_TOKEN` | Interní secret (rezerva pro server-to-server volání) | ➖ |

----------------------------------------------------
4. KV namespace — přehled klíčů
----------------------------------------------------

### USER_ARIES_CES_SID
| Klíč | Obsah | TTL |
|---|---|---|
| `pin:<employeeId>` | `{ salt, hash }` — SHA-256 hash PINu | bez TTL |
| `session:<token>` | `{ employeeId, expiresAt }` | 8 hodin |
| `index:<employeeId>` | `[ { id, key, filename, title, tags, ... } ]` | bez TTL |
| `ratelimit:<ip>` | `{ attempts }` — čítač neúspěšných pokusů | 15 minut |

### ADMIN_ARIES_CES_SID
| Klíč | Obsah | TTL |
|---|---|---|
| `admin_session:<token>` | uživatelské jméno admina | 24 hodin |

----------------------------------------------------
5. Povolené typy souborů
----------------------------------------------------
| Přípona | MIME typ |
|---|---|
| `.pdf` | `application/pdf` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.csv` | `text/csv; charset=utf-8` |
| `.md` | `text/markdown; charset=utf-8` |
| `.xml` | `application/xml; charset=utf-8` |
| `.ts` | `text/typescript; charset=utf-8` |

Maximum velikosti souboru: **20 MB**
