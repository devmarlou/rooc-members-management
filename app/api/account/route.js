import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { validateCharName } from "@/lib/validation";
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
      // identity + reset flag). Look it up fresh so "Connect Discord" can hide
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

// Self-service edits to the caller's own character: renaming. Stats and POV
// links have no opt-in — both are visible to every signed-in member. Every
// other roster field (class, group, party slot, officer flag, etc.) stays
// admin-only via PATCH /api/members/[id].
export async function PATCH(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id,char_name")
      .eq("account_id", session.userId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) {
      return NextResponse.json({ error: "No character is linked to this account yet." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const hasCharName = typeof body.charName === "string";
    if (!hasCharName) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const updates = {};
    const auditEntries = [];
    let charName = member.char_name;

    if (hasCharName) {
      const { error: charNameError, value: validatedCharName } = validateCharName(body.charName);
      if (charNameError) {
        return NextResponse.json({ error: charNameError }, { status: 400 });
      }
      charName = validatedCharName;
      if (charName !== member.char_name) {
        // Same case-insensitive uniqueness check register_local_account/
        // register_member_account run at the DB level. Done in JS here since
        // there's no RPC for a plain rename, and the roster is small enough
        // (GUILD_MEMBER_LIMIT) that fetching char_name once is cheap.
        const { data: roster, error: rosterError } = await supabase
          .from("members")
          .select("char_name")
          .neq("id", member.id);
        if (rosterError) throw rosterError;
        const taken = (roster || []).some(
          (row) => row.char_name?.trim().toLowerCase() === charName.toLowerCase()
        );
        if (taken) {
          return NextResponse.json({ error: "That character name is already taken." }, { status: 409 });
        }
        updates.char_name = charName;
        auditEntries.push(`renamed themselves to ${charName}`);
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ member });
    }

    const { data: updated, error: updateError } = await supabase
      .from("members")
      .update(updates)
      .eq("id", member.id)
      .select("id,char_name,char_class,group_id,joined_at")
      .single();
    if (updateError) throw updateError;

    await writeAuditLog(supabase, request, {
      action: "member.updated",
      targetType: "member",
      targetId: member.id,
      summary: `${charName} ${auditEntries.join(" and ")}`,
      metadata: { before: member, after: updates }
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
