/**
 * Sdílená pomocná funkce pro ověření session tokenu.
 * Použití v list.js / download.js:
 *
 *   import { requireSession } from "./_session.js";
 *   const session = await requireSession(request, env);
 *   if (session instanceof Response) return session; // 401
 *   // session.employeeId je ověřeno
 */

export async function requireSession(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (!token) {
    return new Response("Missing session token", { status: 401 });
  }

  const raw = await env.USER_DATA_BOXES_SID.get(`session:${token}`);
  if (!raw) {
    return new Response("Session expired or invalid", { status: 401 });
  }

  const session = JSON.parse(raw);

  if (Date.now() > session.expiresAt) {
    // Explicitně smazat prošlou session (KV TTL to udělá samo, ale pro jistotu)
    await env.USER_DATA_BOXES_SID.delete(`session:${token}`);
    return new Response("Session expired", { status: 401 });
  }

  return session; // { employeeId, expiresAt }
}
