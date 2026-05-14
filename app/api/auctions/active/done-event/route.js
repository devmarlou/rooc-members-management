import { NextResponse } from "next/server";
import { finishEventAuctions } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const auctionState = await finishEventAuctions(getSupabaseAdmin(), body.auctionIds || []);
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
