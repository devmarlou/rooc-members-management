import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { STATS_SELECT } from "@/lib/memberStats";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Read-only board of members who've opted in (members.show_stats_publicly,
// toggled from their own Account page) to share their latest stats with the
// rest of the guild. Open to any authenticated account, member or admin —
// unlike the admin-only summary at /api/member-stats, which lists the whole
// roster regardless of opt-in. A pending (unapproved) account can never have
// opted in here since it can't sign in to reach the toggle in the first
// place (see app/api/auth/login/route.js), so no extra pending-status filter
// is needed the way /api/member-stats needs one.
export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const [membersResult, statsResult] = await Promise.all([
      supabase
        .from("members")
        .select("id,char_name,char_class")
        .eq("show_stats_publicly", true)
        .order("char_name", { ascending: true }),
      supabase
        .from("member_stats")
        .select(STATS_SELECT)
        .order("submitted_at", { ascending: false })
    ]);
    if (membersResult.error) throw membersResult.error;
    if (statsResult.error) throw statsResult.error;

    const latestByMember = new Map();
    for (const row of statsResult.data || []) {
      if (!latestByMember.has(row.member_id)) latestByMember.set(row.member_id, row);
    }

    const board = (membersResult.data || [])
      .map((member) => ({
        member_id: member.id,
        char_name: member.char_name,
        char_class: member.char_class,
        latest: latestByMember.get(member.id) || null
      }))
      // Opted in but nothing submitted yet — nothing useful to show on the board.
      .filter((entry) => entry.latest);

    return NextResponse.json({ board });
  } catch (error) {
    return handleApiError(error);
  }
}
