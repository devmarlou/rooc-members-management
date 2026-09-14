import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { STATS_SELECT } from "@/lib/memberStats";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Admin-only drill-down into one member's full (up to 2) submission history.
export async function GET(request, { params }) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const { memberId } = await params;
    const supabase = getSupabaseAdmin();

    // The stats query only needs memberId (already known from params), not
    // member's data — run both concurrently instead of sequentially.
    const [{ data: member, error: memberError }, { data: stats, error: statsError }] = await Promise.all([
      supabase.from("members").select("id,char_name,char_class").eq("id", memberId).maybeSingle(),
      supabase.from("member_stats").select(STATS_SELECT).eq("member_id", memberId).order("submitted_at", { ascending: false })
    ]);
    if (memberError) throw memberError;
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (statsError) throw statsError;

    return NextResponse.json({ member, stats: stats || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
