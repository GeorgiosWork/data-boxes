/**
 * GET /api/logout
 * Smaže admin session z KV a zneplatní cookie CF_SESSION.
 * Přesměruje na /login.html.
 */

export async function onRequest({ request, env }) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").map(c => {
      const [k, ...v] = c.split("=");
      return [k.trim(), v.join("=")];
    })
  );

  const token = cookies["CF_SESSION"];
  if (token) {
    await env.ADMIN_ARIES_CES_SID.delete(`admin_session:${token}`);
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/login.html",
      "Set-Cookie": "CF_SESSION=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
