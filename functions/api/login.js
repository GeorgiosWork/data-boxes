/**
 * POST /api/login
 * Tělo (JSON): { username, password }
 *
 * Ověří admina proti env.VALID_USER_1 / VALID_PASS_1 (případně _2).
 * Vytvoří session token, uloží do ADMIN_ARIES_CES_SID jako admin_session:<token>
 * a nastaví HttpOnly cookie CF_SESSION.
 * TTL: 24 hodin.
 */

const SESSION_TTL = 24 * 60 * 60; // 24 hodin

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return json({ success: false, message: "Vyplňte uživatelské jméno i heslo." }, 400);
  }

  // Přihlašovací údaje z environment variables
  const credentials = [
    { user: env.VALID_USER_1, pass: env.VALID_PASS_1 },
    { user: env.VALID_USER_2, pass: env.VALID_PASS_2 },
  ].filter(c => c.user && c.pass);

  if (!credentials.length) {
    return json({ success: false, message: "Chyba konfigurace serveru." }, 500);
  }

  const isValid = credentials.some(c => c.user === username && c.pass === password);

  if (!isValid) {
    return json({ success: false, message: "Neplatné uživatelské jméno nebo heslo." }, 401);
  }

  // Vytvoření session tokenu
  const token = crypto.randomUUID();
  await env.ADMIN_ARIES_CES_SID.put(
    `admin_session:${token}`,
    username,
    { expirationTtl: SESSION_TTL }
  );

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `CF_SESSION=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
