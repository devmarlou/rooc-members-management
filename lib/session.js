import crypto from "node:crypto";

export const SESSION_COOKIE = "encore_admin_session";

const encoder = new TextEncoder();

function getSecret() {
  return process.env.SESSION_SECRET || "dev-only-change-me";
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(username) {
  const payload = base64url(JSON.stringify({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 12
  }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const signatureBytes = encoder.encode(signature);
  const expectedBytes = encoder.encode(expected);
  if (signatureBytes.length !== expectedBytes.length) return null;
  const ok = crypto.timingSafeEqual(signatureBytes, expectedBytes);
  if (!ok) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function isAuthed(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return Boolean(verifySessionToken(token));
}
