// Shared input validators for account identity fields (username, password,
// character name/class) — used by registration (local + Discord), self-service
// rename/password-reset, and admin member create/edit, so the same rules apply
// everywhere an account or roster row gets written instead of drifting per
// route. Mirrors the `{ error }` / `{ value }` shape lib/memberStats.js's
// buildStatsRow already uses.
//
// Also covers member_pov_links' title/link/date fields (see lib/povLinks.js).

import { ensureAbsoluteUrl } from "@/lib/urls";

const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

// bcrypt (via pgcrypto's crypt()+gen_salt('bf'), used by the register_*/
// reset_app_user_password RPCs) only hashes the first 72 bytes of input —
// anything past that is silently ignored, which would be a confusing "your
// password didn't fully matter" surprise. Length-only rule per product
// decision (no complexity requirement).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

const CHAR_NAME_MIN = 2;
const CHAR_NAME_MAX = 24;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

export function validateUsername(username) {
  const value = String(username || "").trim();
  if (!value) return { error: "Username is required." };
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) {
    return { error: `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return { error: "Username can only contain letters, numbers, periods, underscores, and hyphens." };
  }
  return { value };
}

export function validatePassword(password) {
  const value = String(password || "");
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return { error: `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` };
  }
  return { value };
}

export function validateCharName(charName) {
  const value = String(charName || "").trim();
  if (!value) return { error: "Character name is required." };
  if (value.length < CHAR_NAME_MIN || value.length > CHAR_NAME_MAX) {
    return { error: `Character name must be ${CHAR_NAME_MIN}-${CHAR_NAME_MAX} characters.` };
  }
  if (CONTROL_CHARS.test(value)) {
    return { error: "Character name contains invalid characters." };
  }
  return { value };
}

export function validateCharClass(charClass) {
  const value = String(charClass || "").trim();
  if (!value) return { error: "Class is required." };
  return { value };
}

const TITLE_MIN = 1;
const TITLE_MAX = 80;

export function validateTitle(title) {
  const value = String(title || "").trim();
  if (!value) return { error: "Title is required." };
  if (value.length < TITLE_MIN || value.length > TITLE_MAX) {
    return { error: `Title must be ${TITLE_MIN}-${TITLE_MAX} characters.` };
  }
  if (CONTROL_CHARS.test(value)) {
    return { error: "Title contains invalid characters." };
  }
  return { value };
}

// Same sanitize-not-reject approach as member_stats.video_link — a schemeless
// link (e.g. "drive.google.com/...") is normalized to https://, not rejected.
export function validateLink(link) {
  const value = ensureAbsoluteUrl(link);
  if (!value) return { error: "Link is required." };
  return { value };
}

// A plain <input type="date"> gives "YYYY-MM-DD" — validated (including
// rejecting JS's lenient rollover, e.g. "2024-02-30" silently becoming
// March 1) rather than trusted as-is before it reaches the DATE column.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateRecordedDate(date) {
  const value = String(date || "").trim();
  if (!value) return { error: "Date is required." };
  if (!DATE_PATTERN.test(value)) return { error: "Date must be a valid date." };

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const rolledOver =
    parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day;
  if (rolledOver) return { error: "Date must be a valid date." };

  return { value };
}

// Confirms `charClass` is an actual, currently-configured job class rather
// than trusting whatever string the client sent — same lookup already used in
// app/api/member-stats/route.js's reclass check, centralized here so
// registration (which never checked this before) can share it.
export async function charClassExists(supabase, charClass) {
  const { data, error } = await supabase
    .from("job_classes")
    .select("name")
    .eq("name", charClass)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
