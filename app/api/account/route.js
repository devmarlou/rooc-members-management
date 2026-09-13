import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  const session = requireAuth(request, { allowPasswordReset: true });
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: member, error: memberError }, { data: account, error: accountError }] = await Promise.all([
      supabase
        .from("members")
        .select("id,char_name,char_class,group_id,joined_at")
        .eq("account_id", session.userId)
        .maybeSingle(),
      // Session tokens don't carry discord_user_id (lib/session.js only signs
      // identity + reset flag) — look it up fresh so "Connect Discord" can hide
      // itself once already linked.
      supabase
        .from("app_users")
        .select("discord_user_id")
        .eq("id", session.userId)
        .maybeSingle()
    ]);
    if (memberError) throw memberError;
    if (accountError) throw accountError;

    return NextResponse.json({
      username: session.username,
      role: session.role,
      mustResetPassword: Boolean(session.mustResetPassword),
      member: member || null,
      discordLinked: Boolean(account?.discord_user_id)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
