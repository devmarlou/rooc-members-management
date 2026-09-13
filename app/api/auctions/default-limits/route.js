import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { updateDefaultAuctionLimits } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request) {
  const session = requireAdmin(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const payload = await request.json();
    const auctionItems = await updateDefaultAuctionLimits(supabase, payload);
    await emitDashboardEvent(supabase, "auction_default_limits_updated");
    await writeAuditLog(supabase, request, {
      action: "auction.default_limits_updated",
      targetType: "auction_items",
      targetId: null,
      summary: "Updated global auction limits",
      metadata: { payload }
    });
    return NextResponse.json({ auctionItems });
  } catch (error) {
    return handleApiError(error);
  }
}
