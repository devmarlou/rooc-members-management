import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { lockAuctionList } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const auctionState = await lockAuctionList(supabase, body.auctionId);
    await emitDashboardEvent(supabase, "auction_locked");
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
