import { requireSession } from "./_session.js";

export async function onRequestGet({ request, env }) {
  // Ověření session
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const { employeeId } = session;

  const url    = new URL(request.url);
  const key    = url.searchParams.get("key");
  const inline = url.searchParams.get("inline") === "1";

  if (!key) return new Response("Missing ?key", { status: 400 });
  if (key.includes("..")) return new Response("Invalid key", { status: 400 });

  // Klíč musí začínat prefixem klienta — zabrání přístupu k cizím souborům
  // Formát klíče: {employeeId}/{timestamp}_{filename}
  if (!key.startsWith(`${employeeId}/`)) {
    return new Response("Forbidden", { status: 403 });
  }

  const obj = await env.R2.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const contentType = obj.httpMetadata?.contentType || "application/octet-stream";
  const filename    = key.split("/").pop() || "download";

  const headers = new Headers({
    "content-type":             contentType,
    "content-disposition":      `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "cache-control":            inline ? "private, max-age=300" : "no-store",
    "x-content-type-options":   "nosniff",
    "x-frame-options":          "SAMEORIGIN",
  });

  if (obj.etag) headers.set("etag", obj.etag);
  return new Response(obj.body, { headers });
}
