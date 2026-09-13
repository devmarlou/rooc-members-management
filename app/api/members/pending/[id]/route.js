import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { enrollMemberInActiveRound } from "@/lib/memberRoundEnrollment";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Approves or rejects a Discord self-registration that's sitting at status='pending'.
// Approve: flips the account active and enrolls its character into the active round
// (the same side effect app/api/members/route.js does for admin-created members) —
// this is the one place that enrollment now happens for Discord signups.
// Reject: deletes both rows outright so the username/character name are free again,
// rather than leaving a permanently 'disabled' placeholder behind.
export async function POST(request, { params }) {
  if (!requireAdmin(request)) return unauthorized();

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: account, error: accountError } = await supabase
      .from("app_users")
      .select("id,username,status")
      .eq("id", id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account || account.status !== "pending") {
      return NextResponse.json({ error: "No pending registration found." }, { status: 404 });
    }

    if (action === "approve") {
      const { error: updateError } = await supabase
        .from("app_users")
        .update({ status: "active" })
        .eq("id", id);
      if (updateError) throw updateError;

      const { data: memberRow, error: memberError } = await supabase
        .from("members")
        .select("id")
        .eq("account_id", id)
        .maybeSingle();
      if (memberError) throw memberError;
      if (memberRow) await enrollMemberInActiveRound(supabase, memberRow.id);

      await writeAuditLog(supabase, request, {
        action: "account.approved",
        targetType: "app_user",
        targetId: id,
        summary: `Approved registration for ${account.username}`
      });
      return NextResponse.json({ ok: true });
    }

    const { error: deleteMemberError } = await supabase.from("members").delete().eq("account_id", id);
    if (deleteMemberError) throw deleteMemberError;
    const { error: deleteAccountError } = await supabase.from("app_users").delete().eq("id", id);
    if (deleteAccountError) throw deleteAccountError;

    await writeAuditLog(supabase, request, {
      action: "account.rejected",
      targetType: "app_user",
      targetId: id,
      summary: `Rejected registration for ${account.username}`
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
