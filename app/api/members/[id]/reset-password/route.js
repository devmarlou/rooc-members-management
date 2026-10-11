import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Admin-assisted "forgot password" for accounts with no Discord to verify
// against: sets a one-time temporary password and forces the user to choose a
// new one at next sign-in. The temporary password is returned once and never
// stored or logged in plain text.
export async function POST(request, { params }) {
  const session = requireAdmin(request);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("char_name,account_id")
      .eq("id", id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member?.account_id) {
      return NextResponse.json({ error: "This member has no login account." }, { status: 404 });
    }

    const { data: account, error: accountError } = await supabase
      .from("app_users")
      .select("id,username,role")
      .eq("id", member.account_id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json({ error: "This member has no login account." }, { status: 404 });
    }
    if (account.id === session.userId) {
      return NextResponse.json({ error: "You can't reset your own password here." }, { status: 400 });
    }
    if (account.role !== "member" && session.role !== "super_admin") {
      return NextResponse.json({ error: "Only a super admin can reset an admin's password." }, { status: 403 });
    }

    const temporaryPassword = crypto.randomBytes(9).toString("base64url");
    const { data, error } = await supabase.rpc("set_app_user_password", {
      input_user_id: account.id,
      input_new_password: temporaryPassword,
      input_must_reset: true
    });
    if (error) {
      if (String(error.message || "").includes("set_app_user_password")) {
        return NextResponse.json(
          { error: "Password reset is not installed yet. Run .codex/PASSWORD_RESET_RUNBOOK.md." },
          { status: 503 }
        );
      }
      throw error;
    }
    const user = Array.isArray(data) ? data[0] : data;
    if (!user) {
      return NextResponse.json({ error: "This member has no login account." }, { status: 404 });
    }

    await writeAuditLog(supabase, request, {
      action: "account.password_reset_admin",
      targetType: "app_user",
      targetId: account.id,
      summary: `Reset password for ${account.username} (${member.char_name})`
    });
    return NextResponse.json({ ok: true, username: account.username, temporaryPassword });
  } catch (error) {
    return handleApiError(error);
  }
}
