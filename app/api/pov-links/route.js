import { NextResponse, after } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { enforceLatestNRows } from "@/lib/retention";
import { buildPovLinkRow, POV_LINKS_SELECT } from "@/lib/povLinks";
import { appendPovLinkRow } from "@/lib/googleSheets";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function findOwnMember(supabase, session) {
  const { data, error } = await supabase
    .from("members")
    .select("id,char_name,char_class")
    .eq("account_id", session.userId)
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
      }));

    return NextResponse.json({ links });
  } catch (error) {
    return handleApiError(error);
  }
}

// Self-service submit for the caller's own member row — every role can post
// here, not just members (an admin with a linked character can share their
// own POV too; unlike /api/member-stats this route has no admin block).
export async function POST(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const member = await findOwnMember(supabase, session);
    if (!member) return NextResponse.json({ error: "No linked character found for this account." }, { status: 404 });

    const payload = await request.json().catch(() => ({}));
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
      summary: `Submitted a POV link for ${member.char_name}`,
      metadata: { member_id: member.id, title: data.title, submitted_at: data.submitted_at }
    });

    return NextResponse.json({ link: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
