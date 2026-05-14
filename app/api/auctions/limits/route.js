import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { updateRoundLimits } from "@/lib/auctionEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const auctionState = await updateRoundLimits(getSupabaseAdmin(), await request.json());
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
