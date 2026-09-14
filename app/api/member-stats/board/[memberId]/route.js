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
