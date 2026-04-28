import { requireAdminSession } from "./_admin_session.js";

export async function onRequestPost({ request, env }) {
  const check = await requireAdminSession(request, env);
  if (check instanceof Response) return check;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const clientId = body?.clientId;

  if (!id || !clientId) {
    return new Response('Missing "id" or "clientId"', { status: 400 });
  }

  const indexKey = `index:${clientId}`;
  const raw = await env.USER_DATA_BOXES_SID.get(indexKey);
  const items = raw ? JSON.parse(raw) : [];

  const idx = items.findIndex(x => x.id === id);
  if (idx === -1) return new Response("Not found in index", { status: 404 });

  const [entry] = items.splice(idx, 1);

  try {
    await env.R2.delete(entry.key);
    await env.USER_DATA_BOXES_SID.put(indexKey, JSON.stringify(items));
  } catch (err) {
    return new Response("Storage error: " + err.message, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, deleted: entry }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
