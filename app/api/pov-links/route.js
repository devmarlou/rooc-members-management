import { NextResponse, after } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { enforceLatestNRows } from "@/lib/retention";
import { buildPovLinkRow, POV_LINKS_SELECT } from "@/lib/povLinks";
import { appendPovLinkRow } from "@/lib/googleSheets";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isAdminRole(role) {
  return role === "admin" || role === "super_admin";
}

async function findOwnMember(supabase, session) {
  const { data, error } = await supabase
    .from("members")
    .select("id,char_name,char_class")
    .eq("account_id", session.userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findMemberById(supabase, memberId) {
  const { data, error } = await supabase
    .from("members")
    .select("id,char_name,char_class")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Shared list page is open to every authenticated role, not admin-only like
// /api/member-stats — any logged-in account sees everyone's latest POV link.
export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();

    // Same pending-account exclusion as /api/member-stats: a members row
    // exists as soon as registration is submitted, but shouldn't show up
    // here until the linked account is actually approved.
    const [membersResult, pendingAccountsResult, linksResult] = await Promise.all([
      supabase.from("members").select("id,char_name,char_class,account_id").order("char_name", { ascending: true }),
      supabase.from("app_users").select("id").eq("status", "pending"),
      supabase.from("member_pov_links").select(POV_LINKS_SELECT).order("submitted_at", { ascending: false })
    ]);
    if (membersResult.error) throw membersResult.error;
    if (pendingAccountsResult.error) throw pendingAccountsResult.error;
    if (linksResult.error) throw linksResult.error;

    const pendingAccountIds = new Set((pendingAccountsResult.data || []).map((account) => account.id));

    const latestByMember = new Map();
    for (const row of linksResult.data || []) {
      if (!latestByMember.has(row.member_id)) latestByMember.set(row.member_id, row);
    }

    const links = (membersResult.data || [])
      .filter((member) => !member.account_id || !pendingAccountIds.has(member.account_id))
      .map((member) => ({
        member_id: member.id,
        char_name: member.char_name,
        char_class: member.char_class,
        latest: latestByMember.get(member.id) || null
      }))
      // Most recently submitted POV first, so the top of the list is always
      // what's new — members with nothing submitted yet sort to the bottom,
      // alphabetically among themselves (their relative order coming in).
      .sort((a, b) => {
        if (!a.latest && !b.latest) return 0;
        if (!a.latest) return 1;
        if (!b.latest) return -1;
        return new Date(b.latest.submitted_at) - new Date(a.latest.submitted_at);
      });

    return NextResponse.json({ links });
  } catch (error) {
    return handleApiError(error);
  }
}

// Submit a POV link. A member posts their own — the member row is derived
// from the session, never trusted from the client.
//
// Admin/super_admin accounts are never linked to a character, so they have no
// "own" row to post to and must name the member via `member_id` (they file
// clips members send them directly). The row is written exactly as that
// member's own submission would be — same retention, same Sheets append — so
// it lands in the list under their name; only the audit log records who
// actually posted it.
export async function POST(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();

    const payload = await request.json().catch(() => ({}));
    const isAdmin = isAdminRole(session.role);
    const onBehalfOfId = payload.member_id || "";
    if (onBehalfOfId && !isAdmin) {
      return NextResponse.json({ error: "Only admins can submit a POV link for another member." }, { status: 403 });
    }
    if (isAdmin && !onBehalfOfId) {
      return NextResponse.json({ error: "Select the member this POV link belongs to." }, { status: 400 });
    }

    const member = onBehalfOfId
      ? await findMemberById(supabase, onBehalfOfId)
      : await findOwnMember(supabase, session);
    if (!member) {
      return NextResponse.json(
        { error: onBehalfOfId ? "Member not found." : "No linked character found for this account." },
        { status: 404 }
      );
    }

    const { error: validationError, row: linkRow } = buildPovLinkRow(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const row = { member_id: member.id, ...linkRow };

    const { data, error } = await supabase
      .from("member_pov_links")
      .insert(row)
      .select(POV_LINKS_SELECT)
      .single();
    if (error) throw error;

    // Best-effort follow-ups — neither affects the response, so both are
    // deferred to run after the client already has its result. A Sheets
    // failure (e.g. missing/bad credentials) must never block a submission.
    after(async () => {
      try {
        await enforceLatestNRows(supabase, { table: "member_pov_links", memberId: member.id, keep: 2 });
      } catch (retentionError) {
        console.error("member_pov_links retention failed:", retentionError);
      }
    });
    after(async () => {
      try {
        await appendPovLinkRow({
          charName: member.char_name,
          title: data.title,
          link: data.link,
          recordedDate: data.recorded_date,
          fieldType: data.field_type,
          submittedAt: data.submitted_at
        });
      } catch (sheetsError) {
        console.error("appendPovLinkRow failed:", sheetsError);
      }
    });

    await emitDashboardEvent(supabase, "pov_link.submitted");

    await writeAuditLog(supabase, request, {
      action: "pov_link.submitted",
      targetType: "member_pov_links",
      targetId: data.id,
      summary: onBehalfOfId
        ? `Submitted a POV link on behalf of ${member.char_name}`
        : `Submitted a POV link for ${member.char_name}`,
      metadata: {
        member_id: member.id,
        title: data.title,
        submitted_at: data.submitted_at,
        on_behalf: Boolean(onBehalfOfId)
      }
    });

    return NextResponse.json({ link: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
