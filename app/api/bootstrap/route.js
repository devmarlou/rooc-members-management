import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { fetchBootstrapData } from "@/lib/bootstrapData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    return NextResponse.json(await fetchBootstrapData(supabase, { includeNotes: true }), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
