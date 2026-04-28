/**
 * Sdílená pomocná funkce pro ověření admin session z cookie CF_SESSION.
 * Použití v upload.js / delete.js / pin.js / list.js:
 *
 *   import { requireAdminSession } from "./_admin_session.js";
 *   const check = await requireAdminSession(request, env);
 *   if (check instanceof Response) return check; // 401 nebo 403
 */

export async function requireAdminSession(request, env) {
  try {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map(c => {
        const [k, ...v] = c.split("=");
        return [k.trim(), v.join("=")];
      })
    );

    const token = cookies["CF_SESSION"];
    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    const session = await env.ADMIN_ARIES_CES_SID.get(`admin_session:${token}`);
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    return { username: session }; // { username: "admin1" }
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
