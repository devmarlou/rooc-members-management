// Shared URL-sanitizing helper — originally lived only in lib/memberStats.js
// (still re-exported from there for backward compat), now also used by
// lib/povLinks.js so member_stats.video_link and member_pov_links.link don't
// each carry their own copy of the same scheme-normalization rule.

// Members paste plain drive/youtube links like "drive.google.com/..." with no
// scheme — used as-is in an <a href>, the browser resolves that as a relative
// path on this site (e.g. localhost) instead of an external link. Prepend
// https:// when no scheme is present.
//
// Only http(s) is ever accepted as an existing scheme — anything else (most
// importantly "javascript:"/"data:"-style URIs, which an any-scheme regex
// would let straight through) is treated as schemeless and forced under
// https:// instead, since these values are rendered verbatim as an <a href>
// and a non-http(s) scheme there is a stored script-execution risk for
// whoever clicks the link, not just a bad link.
const ABSOLUTE_HTTP_URL = /^https?:\/\//i;
const HAS_URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
export function ensureAbsoluteUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return trimmed;
  if (ABSOLUTE_HTTP_URL.test(trimmed)) return trimmed;
  // Already has some other scheme (javascript:, data:, vbscript:, ftp:, ...) —
  // don't pass it through as-is; treat the whole value as schemeless instead.
  const schemeless = HAS_URL_SCHEME.test(trimmed) ? trimmed.replace(HAS_URL_SCHEME, "") : trimmed;
  return `https://${schemeless}`;
}
