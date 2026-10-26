// Small HTTP helpers shared by the routes.

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function error(status, message) {
  return json({ error: message }, status);
}

// Only the app's own site may call the server from a browser.
export function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-expose-headers': 'retry-after',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

// Sent on every response. This is an API that only returns JSON, so
// browsers are told not to guess types, cache, frame, or load anything.
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

export function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...corsHeaders(request, env) })) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

// Bodies must be JSON; anything else is refused before it is read.
export function requireJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    throw Object.assign(new Error('Send JSON with content-type: application/json'), { status: 415 });
  }
}

export async function readJson(request, maxBytes) {
  requireJson(request);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw Object.assign(new Error('Too large'), { status: 413 });
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Too large'), { status: 413 });
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time comparison for secrets.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
