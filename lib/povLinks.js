// Shared shape/validation for a member_pov_links row — used by the
// self-service submission route (app/api/pov-links/route.js). Mirrors the
// `{ error }` / `{ value: row }` shape lib/memberStats.js's buildStatsRow uses.
import { validateFieldType, validateLink, validateRecordedDate, validateTitle } from "@/lib/validation";

export const POV_LINKS_SELECT = "id,member_id,title,link,recorded_date,field_type,submitted_at,created_at";

// Validates a raw POV link payload and returns either { error } or { row } —
// `row` still needs `member_id` merged in by the caller, same convention as
// buildStatsRow (the caller derives it from the session, never trusts the
// client for it).
export function buildPovLinkRow(payload = {}) {
  const { error: titleError, value: title } = validateTitle(payload.title);
  if (titleError) return { error: titleError };

  const { error: linkError, value: link } = validateLink(payload.link);
  if (linkError) return { error: linkError };

  const { error: dateError, value: recordedDate } = validateRecordedDate(payload.recorded_date);
  if (dateError) return { error: dateError };

  const { error: fieldTypeError, value: fieldType } = validateFieldType(payload.field_type);
  if (fieldTypeError) return { error: fieldTypeError };

  return { row: { title, link, recorded_date: recordedDate, field_type: fieldType } };
}
