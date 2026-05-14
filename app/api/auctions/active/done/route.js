import { NextResponse } from "next/server";
import { finishActiveAuction } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const auctionState = await finishActiveAuction(supabase, body.auctionId);
    await emitDashboardEvent(supabase, "auction_done");
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
