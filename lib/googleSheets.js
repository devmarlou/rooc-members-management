// Best-effort archive of every POV link submission to an external Google
// Sheet. member_pov_links only keeps the latest 2 rows per member (see
// lib/retention.js) — the Sheet is where full, unbounded history survives.
//
// Talks to the Sheets API directly via fetch + a hand-signed service-account
// JWT instead of the `googleapis` package — Node's built-in `crypto` already
// covers RS256 signing, so no new dependency is needed for this.
//
// No-ops (logs and returns) when GOOGLE_SHEETS_* env vars aren't set yet, so
// submissions work today and real credentials can be dropped in later with
// no code change. See .codex/POV_LIST_IMPLEMENTATION_PLAN.md for setup steps.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const APPEND_RANGE = "Sheet1!A:F";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
      process.env.GOOGLE_SHEETS_PRIVATE_KEY &&
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  );
}

// Service-account OAuth2 flow (RFC 7523 JWT bearer grant) — exchanges a
// self-signed JWT for a short-lived access token, no user/browser step
// involved since this runs server-side with a service account.
async function getAccessToken() {
  const { createSign } = await import("node:crypto");
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  // Env vars can't hold literal newlines, so private keys are stored with
  // escaped "\n" sequences and unescaped here before signing.
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n");

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600
    })
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(privateKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Google token exchange failed.");
  return data.access_token;
}

// member_pov_links.field_type ("main"/"sub"/"woe") displayed as its full
// label in the archive sheet, same labels the app shows in the POV form/list.
const FIELD_TYPE_LABELS = { main: "Main Field", sub: "Sub Field", woe: "WOE" };

// Appends one row: [char name, title, link, recorded date, field, submitted at].
// Best-effort — callers should invoke this from a deferred after() block and
// only log failures, never let it fail the member's own submission.
export async function appendPovLinkRow({ charName, title, link, recordedDate, fieldType, submittedAt }) {
  if (!isConfigured()) {
    console.warn("appendPovLinkRow skipped: GOOGLE_SHEETS_* env vars are not configured.");
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const accessToken = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(APPEND_RANGE)}:append?valueInputOption=RAW`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [[charName, title, link, recordedDate, FIELD_TYPE_LABELS[fieldType] || "Main Field", submittedAt]]
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Google Sheets append failed (${response.status}).`);
  }
}
