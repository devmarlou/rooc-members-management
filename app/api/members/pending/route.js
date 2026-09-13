import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Lists Discord self-registrations awaiting admin approval (status='pending'),
// paired with the character info they submitted, for the admin approve/reject UI.
export async function GET(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data: accounts, error } = await supabase
      .from("app_users")
      .select("id,username,discord_user_id,discord_linked_at")
      .eq("status", "pending")
      .order("discord_linked_at", { ascending: true });
    if (error) throw error;

    const accountIds = (accounts || []).map((account) => account.id);
    let membersByAccountId = new Map();
    if (accountIds.length) {
      const { data: memberRows, error: memberError } = await supabase
        .from("members")
        .select("id,char_name,char_class,account_id")
        .in("account_id", accountIds);
      if (memberError) throw memberError;
      membersByAccountId = new Map((memberRows || []).map((member) => [member.account_id, member]));
    }

    const pending = (accounts || []).map((account) => ({
      ...account,
      member: membersByAccountId.get(account.id) || null
    }));

    return NextResponse.json({ pending });
  } catch (error) {
    return handleApiError(error);
  }
}
