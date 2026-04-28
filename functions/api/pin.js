import { requireAdminSession } from "./_admin_session.js";

const KNOWN_CLIENTS = new Set(
  Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`)
);

async function hashPin(pin, saltHex) {
  const salt    = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const pinBuf  = new TextEncoder().encode(pin);
  const data    = new Uint8Array([...salt, ...pinBuf]);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return {
    salt: bytesToHex(salt),
    hash: bytesToHex(new Uint8Array(hashBuf)),
  };
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++)
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** GET /api/pin — vrátí { pins: { "C001": true, "C002": false, ... } } */
export async function onRequestGet({ request, env }) {
  const check = await requireAdminSession(request, env);
  if (check instanceof Response) return check;

  const result = {};
  await Promise.all(
    [...KNOWN_CLIENTS].map(async id => {
      const val = await env.USER_DATA_BOXES_SID.get(`pin:${id}`);
      result[id] = val !== null;
    })
  );

  return new Response(JSON.stringify({ pins: result }), {
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  const check = await requireAdminSession(request, env);
  if (check instanceof Response) return check;

  const body = await request.json().catch(() => null);
  const { employeeId, pin } = body || {};

  if (!employeeId || !pin) {
    return new Response('Missing "employeeId" or "pin"', { status: 400 });
  }
  if (!KNOWN_CLIENTS.has(employeeId)) {
    return new Response("Unknown clientId", { status: 400 });
  }
  if (typeof pin !== "string" || pin.length < 4 || pin.length > 64) {
    return new Response("PIN musí mít 4–64 znaků", { status: 400 });
  }

  const { salt, hash } = await hashPin(pin);
  await env.USER_DATA_BOXES_SID.put(`pin:${employeeId}`, JSON.stringify({ salt, hash }));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
