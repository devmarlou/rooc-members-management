import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { fetchBootstrapData } from "@/lib/bootstrapData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    return NextResponse.json(await fetchBootstrapData(supabase, { includeNotes: true }), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
