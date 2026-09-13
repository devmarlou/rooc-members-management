import crypto from "node:crypto";

// Shared helpers for the Discord OAuth2 + PKCE flow. Mirrors the signed-cookie
// pattern already used by lib/session.js so both short-lived cookies here are
// tamper-evident even though they never carry admin-level trust.
export const OAUTH_STATE_COOKIE = "discord_oauth_state";
export const PENDING_REGISTRATION_COOKIE = "discord_pending_registration";

const OAUTH_STATE_TTL_MS = 1000 * 60 * 10; // 10 minutes to complete the Discord redirect round trip
const PENDING_REGISTRATION_TTL_MS = 1000 * 60 * 15; // 15 minutes to fill out the registration form

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";

function getSecret() {
  return process.env.SESSION_SECRET || "dev-only-change-me";
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function createSignedToken(data, ttlMs) {
  const payload = base64url(JSON.stringify({ ...data, exp: Date.now() + ttlMs }));
  return `${payload}.${sign(payload)}`;
}

function verifySignedToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length) return null;
  if (!crypto.timingSafeEqual(signatureBytes, expectedBytes)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// --- OAuth state (CSRF + PKCE) cookie ---------------------------------------

export function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState() {
  return crypto.randomBytes(16).toString("base64url");
}

// intent/accountId are optional — only set when this state token is for the
// "connect Discord to my already-logged-in account" flow (see
// app/api/auth/discord/link/start/route.js) rather than ordinary sign-in.
export function createOAuthStateToken({ state, codeVerifier, intent, accountId }) {
  return createSignedToken({ state, codeVerifier, intent, accountId }, OAUTH_STATE_TTL_MS);
}

export function verifyOAuthStateToken(token) {
  return verifySignedToken(token);
}

// --- Pending-registration cookie (holds the verified Discord user id while
// the user fills out the completion form) -----------------------------------

export function createPendingRegistrationToken({ discordUserId }) {
  return createSignedToken({ discordUserId }, PENDING_REGISTRATION_TTL_MS);
}

export function verifyPendingRegistrationToken(token) {
  return verifySignedToken(token);
}

// --- Discord API calls -------------------------------------------------------

export function buildDiscordAuthorizeUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || "",
    redirect_uri: process.env.DISCORD_REDIRECT_URI || "",
    response_type: "code",
    scope: "identify",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeDiscordCode({ code, codeVerifier }) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || "",
    client_secret: process.env.DISCORD_CLIENT_SECRET || "",
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI || "",
    code_verifier: codeVerifier
  });

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed (${response.status})`);
  }
  return response.json();
}

export async function fetchDiscordIdentity(accessToken) {
  const response = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Discord identity lookup failed (${response.status})`);
  }
  return response.json();
}
