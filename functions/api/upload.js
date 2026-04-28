import { requireAdminSession } from "./_admin_session.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED = {
  ".pdf":  "application/pdf",
  ".zip":  "application/zip",
  ".zfo":  "application/vnd.software602.filler.form-xml-zip",
};

export async function onRequestPost({ request, env }) {
  const check = await requireAdminSession(request, env);
  if (check instanceof Response) return check;

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return new Response("Expected multipart/form-data", { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const clientId = (form.get("clientId") || "").toString().trim();
  const title = (form.get("title") || "").toString().trim();
  const tagsRaw = (form.get("tags") || "").toString().trim();
  const tags = tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20) : [];

  if (!(file instanceof File)) return new Response('Missing form field "file"', { status: 400 });
  if (!clientId) return new Response("Missing clientId", { status: 400 });

  // Validace velikosti
  if (file.size > MAX_FILE_SIZE) {
    return new Response(`Soubor je příliš velký. Maximum je ${MAX_FILE_SIZE / 1024 / 1024} MB.`, { status: 413 });
  }
  if (file.size === 0) {
    return new Response("Soubor je prázdný.", { status: 400 });
  }

  // Validace přípony
  const filename = file.name || "upload.bin";
  const lower = filename.toLowerCase();
  const ext = Object.keys(ALLOWED).find(e => lower.endsWith(e));

  if (!ext) {
    return new Response(
      `Nepodporovaný typ souboru. Povoleny jsou: ${Object.keys(ALLOWED).join(", ")}`,
      { status: 415 }
    );
  }

  const contentTypeGuess = ALLOWED[ext];
  const createdAt = new Date().toISOString();
  const safeName = filename.replace(/[^\w.\-]+/g, "_");
  const key = `${clientId}/${Date.now()}_${safeName}`;

  // Nahrání do R2
  const buffer = await file.arrayBuffer();
  await env.R2.put(key, buffer, {
    httpMetadata: { contentType: contentTypeGuess },
  });

  // Aktualizace KV indexu
  const indexKey = `index:${clientId}`;
  const raw = await env.USER_ARIES_CES_SID.get(indexKey);
  const items = raw ? JSON.parse(raw) : [];

  const entry = {
    id: crypto.randomUUID(),
    key,
    filename,
    title: title || filename,
    tags,
    contentType: contentTypeGuess,
    size: file.size,
    createdAt,
  };

  items.unshift(entry);
  await env.USER_ARIES_CES_SID.put(indexKey, JSON.stringify(items));

  return new Response(JSON.stringify({ ok: true, entry }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
