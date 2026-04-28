/**
 * POST /api/auth
 * Tělo (JSON): { employeeId: "Z0039", pin: "..." }
 *
 * 1. Zkontroluje rate limit pro IP (max 5 neúspěšných pokusů / 15 min)
 * 2. Ověří heslo oproti SHA-256 hashi v KV
 * 3. Vytvoří session token (32 náhodných bajtů, hex)
 * 4. Session platí 8 hodin (jedno pracovní sezení)
 * 5. Vrátí { ok: true, sessionToken, expiresAt, name }
 */

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hodin
const RL_MAX_ATTEMPTS     = 5;            // max neúspěšných pokusů per IP
const RL_WINDOW_SECONDS   = 15 * 60;      // okno 15 minut

const EMPLOYEES = {
  "Z0039": "Filipová Petra",
  "Z0037": "Lukavská Adéla",
  "Z0050": "Prouzová Lenka",
  "Z0068": "Čapková Kateřina",
  "Z0052": "Nezvalová Jolana",
  "Z0067": "Koval Olena",
  "Z0066": "Krayczy Erik",
  "Z0069": "Lenher Daryna",
  "Z0043": "Izáková Květa",
  "Z0070": "Izáková Adéla",
};

// ── Rate limiting helpers ──

function getClientIp(request) {
  // Cloudflare vkládá skutečnou IP do CF-Connecting-IP
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function checkRateLimit(env, ip) {
  const raw = await env.USER_ARIES_CES_SID.get(`ratelimit:${ip}`);
  const data = raw ? JSON.parse(raw) : { attempts: 0 };
  return data.attempts >= RL_MAX_ATTEMPTS;
}

async function incrementRateLimit(env, ip) {
  const raw = await env.USER_ARIES_CES_SID.get(`ratelimit:${ip}`);
  const data = raw ? JSON.parse(raw) : { attempts: 0 };
  data.attempts += 1;
  await env.USER_ARIES_CES_SID.put(
    `ratelimit:${ip}`,
    JSON.stringify(data),
    { expirationTtl: RL_WINDOW_SECONDS }
  );
}

async function resetRateLimit(env, ip) {
  await env.USER_ARIES_CES_SID.delete(`ratelimit:${ip}`);
}

// ── Crypto helpers ──

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++)
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPin(pin, salt, expectedHash) {
  const saltBytes = hexToBytes(salt);
  const pinBuf    = new TextEncoder().encode(pin);
  const data      = new Uint8Array([...saltBytes, ...pinBuf]);
  const hashBuf   = await crypto.subtle.digest("SHA-256", data);
  const actual    = bytesToHex(new Uint8Array(hashBuf));
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

// ── Handler ──

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);

  // 1. Zkontroluj rate limit před zpracováním požadavku
  const blocked = await checkRateLimit(env, ip);
  if (blocked) {
    return new Response(
      JSON.stringify({ ok: false, reason: "rate_limited" }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "Retry-After": String(RL_WINDOW_SECONDS),
        },
      }
    );
  }

  const body = await request.json().catch(() => null);
  const { employeeId, pin } = body || {};

  // 2. Základní validace vstupu — neúspěch se počítá do limitu
  if (!employeeId || !pin || !EMPLOYEES[employeeId]) {
    await incrementRateLimit(env, ip);
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. Načti hash PINu z KV
  const raw = await env.USER_ARIES_CES_SID.get(`pin:${employeeId}`);
  if (!raw) {
    // Žádný PIN nastaven — neinkrementuj (není to útok, ale chyba konfigurace)
    return new Response(JSON.stringify({ ok: false, reason: "no_pin" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // 4. Ověř PIN
  const { salt, hash } = JSON.parse(raw);
  const valid = await verifyPin(String(pin), salt, hash);

  if (!valid) {
    // Neúspěšný pokus — zapiš do rate limit počítadla
    await incrementRateLimit(env, ip);
    return new Response("Unauthorized", { status: 401 });
  }

  // 5. Úspěch — resetuj počítadlo a vytvoř session
  await resetRateLimit(env, ip);

  const tokenBytes   = crypto.getRandomValues(new Uint8Array(32));
  const sessionToken = bytesToHex(tokenBytes);
  const expiresAt    = Date.now() + SESSION_TTL_SECONDS * 1000;

  await env.USER_ARIES_CES_SID.put(
    `session:${sessionToken}`,
    JSON.stringify({ employeeId, expiresAt }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return new Response(JSON.stringify({
    ok: true,
    sessionToken,
    expiresAt,
    name: EMPLOYEES[employeeId],
  }), {
    headers: { "content-type": "application/json" },
  });
}
