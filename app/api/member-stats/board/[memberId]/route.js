import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { STATS_SELECT } from "@/lib/memberStats";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Same response shape as the admin-only GET /api/member-stats/[memberId], but
// open to any authenticated account and scoped to members who've opted into
// the public board — everyone else's history stays admin-only.
export async function GET(request, { params }) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const { memberId } = await params;
    const supabase = getSupabaseAdmin();

    // Same reciprocity gate as GET /api/member-stats/board — a member has to
    // have opted in themselves before drilling into anyone else's history.
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

    const [{ data: member, error: memberError }, { data: stats, error: statsError }] = await Promise.all([
      supabase.from("members").select("id,char_name,char_class,show_stats_publicly").eq("id", memberId).maybeSingle(),
      supabase.from("member_stats").select(STATS_SELECT).eq("member_id", memberId).order("submitted_at", { ascending: false })
    ]);
    if (memberError) throw memberError;
    if (!member || !member.show_stats_publicly) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    if (statsError) throw statsError;

    return NextResponse.json({ member, stats: stats || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
