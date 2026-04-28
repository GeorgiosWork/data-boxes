| data-boxes | (c) 2026 Gios |
|------------|---------------|

----------------------------------------------------
1. Ucel projektu
----------------------------------------------------

`data-boxes` je jednoduchy portal pro evidenci a bezpecne ukladani souboru datovych schranek pro klienty `C001` az `C050`.

Projekt je urceny pro:
- nahravani souboru datovych schranek administratorem,
- ulozeni souboru do Cloudflare R2,
- vedeny index souboru v Cloudflare KV,
- prihlaseni klienta pres cislo klienta a PIN,
- zobrazeni a stazeni pouze vlastnich souboru klienta.

Povolene typy souboru jsou pouze:
- `.zip`
- `.pdf`
- `.zfo`

Maximum velikosti jednoho souboru: **20 MB**.

----------------------------------------------------
2. Struktura projektu
----------------------------------------------------

```plaintext
data-boxes/
├── functions/
│   ├── api/
│   │   ├── _admin_session.js  # Helper: overeni admin session z cookie CF_SESSION
│   │   ├── _session.js        # Helper: overeni klientske session z Bearer tokenu
│   │   ├── auth.js            # POST /api/auth - prihlaseni klienta (cislo klienta + PIN)
│   │   ├── login.js           # POST /api/login - prihlaseni admina (cookie session)
│   │   ├── logout.js          # GET  /api/logout - odhlaseni admina
│   │   ├── upload.js          # POST /api/upload - nahrani souboru datove schranky
│   │   ├── download.js        # GET  /api/download - stazeni souboru klientem
│   │   ├── list.js            # GET  /api/list - seznam souboru
│   │   ├── delete.js          # POST /api/delete - smazani souboru administratorem
│   │   └── pin.js             # GET/POST /api/pin - sprava PINu klientu
│   └── _middleware.js         # Ochrana /admin.html pomoci admin session
├── public/
│   ├── admin.html             # Administrace souboru a PINu
│   ├── credentials.html       # Stranka pro predani prihlasovacich udaju
│   ├── favicon.ico
│   ├── index.html             # Klientsky portal
│   └── login.html             # Prihlaseni admina
├── README.md
└── wrangler.toml
```

----------------------------------------------------
3. Role a prace se soubory
----------------------------------------------------

### Administrator
- Prihlasuje se pres `POST /api/login`.
- V administraci vybira klienta `C001` az `C050`.
- Nahrava soubory datovych schranek ve formatu `.zip`, `.pdf` nebo `.zfo`.
- Nastavuje nebo meni klientsky PIN.
- Muze zobrazit seznam souboru klienta a soubory odstranit.

### Klient
- Prihlasuje se pres `POST /api/auth`.
- Pouziva cislo klienta, napr. `C001`, a prideleny PIN.
- Po prihlaseni vidi pouze soubory ulozene pod vlastnim klientskym cislem.
- Muze soubory stahovat; PDF lze otevrit inline.

----------------------------------------------------
4. Autentizace a session
----------------------------------------------------

### Admin session
- Session je ulozena v KV pod klicem `admin_session:<token>`.
- Token je predavan jako HttpOnly cookie `CF_SESSION`.
- Platnost admin session je 24 hodin.
- `/admin.html` je chraneno middlewarem `_middleware.js`.
- Admin API endpointy overuji cookie pres `_admin_session.js`.

### Klientska session
- PIN je ulozen v KV jako SHA-256 hash se soli pod klicem `pin:<clientId>`.
- Klientska session je ulozena pod klicem `session:<token>`.
- Token je predavan v hlavicce `Authorization: Bearer <token>`.
- Platnost klientske session je 8 hodin.
- Session obsahuje identifikator klienta, napr. `C001`.

### Rate limiting
- Endpoint `/api/auth` povoluje maximalne 5 neuspesnych pokusu z jedne IP adresy za 15 minut.
- Citac je ulozen v KV pod klicem `ratelimit:<ip>`.
- Pri prekroceni limitu API vraci HTTP 429 a hlavicku `Retry-After: 900`.

----------------------------------------------------
5. Ukladani dat
----------------------------------------------------

### R2
Soubory jsou ukladany do Cloudflare R2. Klic objektu ma tvar:

```plaintext
<clientId>/<timestamp>_<filename>
```

Priklad:

```plaintext
C001/1777344000000_datova-zprava.zfo
```

Tento prefix zaroven brani klientovi pristupovat k souborum jineho klienta.

### KV index
Metadata souboru jsou vedena v KV pod klicem:

```plaintext
index:<clientId>
```

Zaznam v indexu obsahuje zejmena:
- `id` - interni ID zaznamu,
- `key` - R2 klic souboru,
- `filename` - puvodni nazev souboru,
- `title` - zobrazovany nazev nebo kategorie,
- `tags` - kategorie souboru,
- `contentType` - MIME typ,
- `size` - velikost souboru,
- `createdAt` - datum nahrani.

----------------------------------------------------
6. Cloudflare Pages
----------------------------------------------------

### Priklad wrangler.toml

```toml
name = "data-boxes-app"
compatibility_date = "2026-04-05"
pages_build_output_dir = "public"

[[r2_buckets]]
binding = "R2"
bucket_name = "data-boxes-bucket"

[[kv_namespaces]]
binding = "USER_DATA_BOXES_SID"
id = "<kv-namespace-id>"

[[kv_namespaces]]
binding = "ADMIN_DATA_BOXES_SID"
id = "<kv-namespace-id>"
```

> Poznamka: pokud ve zdrojovem kodu zustavaji puvodni nazvy bindingu, je nutne sladit `wrangler.toml`, nazvy bindingu v kodu a nazvy v Cloudflare dashboardu.

### Environment variables

Nastavit v Cloudflare dashboardu: **Settings -> Environment variables -> Production**.

| Promenna | Popis | Povinna |
|---|---|---|
| `VALID_USER_1` | Uzivatelske jmeno admina | ano |
| `VALID_PASS_1` | Heslo admina | ano |
| `VALID_USER_2` | Uzivatelske jmeno druheho admina | ne |
| `VALID_PASS_2` | Heslo druheho admina | ne |
| `ADMIN_TOKEN` | Interni secret pro pripadne server-to-server volani | ne |

----------------------------------------------------
7. KV klice
----------------------------------------------------

### Klientske KV

| Klic | Obsah | TTL |
|---|---|---|
| `pin:<clientId>` | `{ salt, hash }` - hash PINu klienta | bez TTL |
| `session:<token>` | `{ clientId, expiresAt }` - session klienta | 8 hodin |
| `index:<clientId>` | `[ { id, key, filename, title, tags, ... } ]` | bez TTL |
| `ratelimit:<ip>` | `{ attempts }` - citac neuspesnych pokusu | 15 minut |

### Admin KV

| Klic | Obsah | TTL |
|---|---|---|
| `admin_session:<token>` | uzivatelske jmeno admina | 24 hodin |

----------------------------------------------------
8. Povolene typy souboru
----------------------------------------------------

| Pripona | MIME typ |
|---|---|
| `.zip` | `application/zip` |
| `.pdf` | `application/pdf` |
| `.zfo` | `application/vnd.software602.filler.form-xml-zip` |

Nepovolene typy souboru API odmita odpovedi HTTP 415.
