import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { STATS_SELECT } from "@/lib/memberStats";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Read-only board of everyone's latest stats, open to any authenticated
// account, member or admin. There's no per-member opt-in: submitting stats
// makes them visible to the rest of the guild. It still differs from the
// admin-only summary at /api/member-stats, which lists the whole roster
// including members who've never submitted. A pending (unapproved) account
// can't sign in to submit anything (see app/api/auth/login/route.js), so it
// never has a latest row and drops out below without a separate
// pending-status filter the way /api/member-stats needs one.
export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();

    const [membersResult, statsResult] = await Promise.all([
      supabase
        .from("members")
        .select("id,char_name,char_class")
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
      // Nothing submitted yet — nothing useful to show on the board.
      .filter((entry) => entry.latest)
      // Most recently submitted stats first, so the top row is always the
      // newest update rather than whoever's alphabetically first.
      .sort((a, b) => new Date(b.latest.submitted_at) - new Date(a.latest.submitted_at));

    return NextResponse.json({ board });
  } catch (error) {
    return handleApiError(error);
  }
}
