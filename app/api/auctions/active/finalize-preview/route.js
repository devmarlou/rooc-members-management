import { NextResponse } from "next/server";
import { previewFinishAuction, previewFinishEventAuctions } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const auctionIds = Array.isArray(body.auctionIds) ? body.auctionIds.filter(Boolean) : [];
    const preview = auctionIds.length
      ? await previewFinishEventAuctions(supabase, auctionIds)
      : await previewFinishAuction(supabase, body.auctionId);
    return NextResponse.json({ preview });
  } catch (error) {
    return handleApiError(error);
  }
}
