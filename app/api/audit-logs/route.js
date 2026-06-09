import { NextResponse } from "next/server";
import { handleApiError, requireRole, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  if (!requireRole(request, "super_admin")) return unauthorized();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("audit_logs")
      .select("id,actor_username,actor_role,action,target_type,target_id,summary,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
