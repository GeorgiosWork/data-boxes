import { requireSession } from "./_session.js";
import { requireAdminSession } from "./_admin_session.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Pokud je přítomen Bearer token → klient (ignoruj cookie)
  const auth = request.headers.get("authorization") || "";
  const hasBearer = auth.startsWith("Bearer ");

  let employeeId;

  if (!hasBearer) {
    // Bez Bearer tokenu → zkus admin cookie session
    const adminCheck = await requireAdminSession(request, env);
    if (adminCheck instanceof Response) {
      return new Response("Unauthorized", { status: 401 });
    }
    // Admin režim — clientId z URL, povinné
    const clientId = url.searchParams.get("clientId");
    if (!clientId) return new Response("Missing clientId", { status: 400 });
    employeeId = clientId;
  } else {
    // Klient — ověř Bearer session token
    const session = await requireSession(request, env);
    if (session instanceof Response) return session;
    employeeId = session.employeeId;
  }

  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const cursor = url.searchParams.get("cursor") || null;

  const raw      = await env.USER_DATA_BOXES_SID.get(`index:${employeeId}`);
  const allItems = raw ? JSON.parse(raw) : [];

  // Stránkování pomocí cursor (= id posledního zobrazeného záznamu)
  let startIdx = 0;
  if (cursor) {
    const found = allItems.findIndex(x => x.id === cursor);
    startIdx = found === -1 ? 0 : found + 1;
  }

  const pageItems  = allItems.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < allItems.length
    ? pageItems[pageItems.length - 1]?.id ?? null
    : null;

  return new Response(JSON.stringify({ items: pageItems, nextCursor }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
