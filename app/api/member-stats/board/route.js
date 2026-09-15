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

    // Reciprocity gate: a member only gets to see the board once they've
    // opted their own stats into it. Admins/super_admins always see it, same
    // as they see everything else.
    if (session.role !== "admin" && session.role !== "super_admin") {
      const { data: caller, error: callerError } = await supabase
        .from("members")
        .select("show_stats_publicly")
        .eq("account_id", session.userId)
        .maybeSingle();
      if (callerError) throw callerError;
      if (!caller?.show_stats_publicly) {
        return NextResponse.json(
          { error: "Opt in on your Account page to view the public stats board.", optInRequired: true },
          { status: 403 }
        );
      }
    }

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
      .filter((entry) => entry.latest)
      // Most recently submitted stats first, so the top row is always the
      // newest update rather than whoever's alphabetically first.
      .sort((a, b) => new Date(b.latest.submitted_at) - new Date(a.latest.submitted_at));

    return NextResponse.json({ board });
  } catch (error) {
    return handleApiError(error);
  }
}
