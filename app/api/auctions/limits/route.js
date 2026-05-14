import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { updateRoundLimits } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const auctionState = await updateRoundLimits(supabase, await request.json());
    await emitDashboardEvent(supabase, "auction_limits_updated");
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
