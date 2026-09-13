import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  const session = requireAuth(request, { allowPasswordReset: true });
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data: member, error } = await supabase
      .from("members")
      .select("id,char_name,char_class,group_id,joined_at")
      .eq("account_id", session.userId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      username: session.username,
      role: session.role,
      mustResetPassword: Boolean(session.mustResetPassword),
      member: member || null
    });
  } catch (error) {
    return handleApiError(error);
  }
}
