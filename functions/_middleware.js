/**
 * _middleware.js — ochrana admin zóny
 *
 * Chráněno: /admin.html (a /admin)
 * Veřejné:  vše ostatní — index.html, login.html, /api/*
 *
 * Admin session je uložena v ADMIN_ARIES_CES_SID pod klíčem admin_session:<token>
 */

const ADMIN_PATHS = ["/admin", "/admin.html"];

export async function onRequest(context) {
  const { request, next, env } = context;
  const url  = new URL(request.url);
  const path = url.pathname;

  // Pouze admin cesty chráníme
  const isAdminPath = ADMIN_PATHS.some(p => path === p || path.startsWith(p));
  if (!isAdminPath) {
    return await next();
  }

  // Ověření cookie CF_SESSION
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").map(c => {
      const [k, ...v] = c.split("=");
      return [k.trim(), v.join("=")];
    })
  );

  const token   = cookies["CF_SESSION"];
  const session = token
    ? await env.ADMIN_ARIES_CES_SID.get(`admin_session:${token}`)
    : null;

  if (!session) {
    // Nepřihlášen → přesměruj na login
    return Response.redirect(`${url.origin}/login.html`, 302);
  }

  // Přihlášen → pokračuj
  return await next();
}
