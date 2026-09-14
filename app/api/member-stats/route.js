import { NextResponse, after } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { enforceMemberStatsRetention } from "@/lib/memberStatsRetention";
import { buildStatsRow, STATS_SELECT } from "@/lib/memberStats";
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

// Shared by POST (initial submission) and PATCH (editing the latest one) —
// both can carry a reclass alongside stats, and both need it validated
// against the live job_classes list the same way.
async function resolveEffectiveClass(supabase, member, requestedClass) {
  const trimmed = String(requestedClass || "").trim();
  if (!trimmed || trimmed === member.char_class) return { class: member.char_class };
  const { data: classRow, error } = await supabase
    .from("job_classes")
    .select("name")
    .eq("name", trimmed)
    .maybeSingle();
  if (error) throw error;
  if (!classRow) return { error: "Invalid class selected." };
  return { class: trimmed };
}

async function applyClassChangeIfNeeded(supabase, request, member, effectiveClass) {
  if (effectiveClass === member.char_class) return;
  const { error } = await supabase.from("members").update({ char_class: effectiveClass }).eq("id", member.id);
  if (error) throw error;

  await writeAuditLog(supabase, request, {
    action: "member.updated",
    targetType: "member",
    targetId: member.id,
    summary: `${member.char_name} changed class from ${member.char_class} to ${effectiveClass} via stats submission`,
    metadata: { before: { char_class: member.char_class }, after: { char_class: effectiveClass } }
  });
}

export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();

    if (!isAdminRole(session.role)) {
      const member = await findOwnMember(supabase, session);
      if (!member) return NextResponse.json({ error: "No linked character found for this account." }, { status: 404 });

      const { data, error } = await supabase
        .from("member_stats")
        .select(STATS_SELECT)
        .eq("member_id", member.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;

      return NextResponse.json({ stats: data || [] });
    }

    // Admin-tier: a per-member summary across the whole roster, including
    // members who haven't submitted anything yet. Selects every stats column
    // (not just the simplified table's few fields) so the admin UI's "all
    // stats" table view can render the full sheet without a second fetch.
    //
    // A registration's `members` row exists (and counts against the roster
    // cap) as soon as it's submitted — it only sits at status='pending' on
    // its linked app_users row until an admin approves it (see
    // app/api/members/pending/[id]/route.js). This list should only surface
    // a member once they're actually on the roster, so pending accounts are
    // excluded the same way app/api/members/pending/route.js identifies them.
    const [membersResult, pendingAccountsResult, statsResult] = await Promise.all([
      supabase.from("members").select("id,char_name,char_class,account_id").order("char_name", { ascending: true }),
      supabase.from("app_users").select("id").eq("status", "pending"),
      supabase
        .from("member_stats")
        .select(STATS_SELECT)
        .order("submitted_at", { ascending: false })
    ]);
    if (membersResult.error) throw membersResult.error;
    if (pendingAccountsResult.error) throw pendingAccountsResult.error;
    if (statsResult.error) throw statsResult.error;

    const pendingAccountIds = new Set((pendingAccountsResult.data || []).map((account) => account.id));

    // Retention keeps at most 2 rows per member, and statsResult is already
    // ordered newest-first across the whole roster, so the first row seen per
    // member_id is "latest" (UPDATED) and the second is "previous" (OLD) —
    // needed so the CSV export can offer either snapshot without a second
    // per-member fetch.
    const latestByMember = new Map();
    const previousByMember = new Map();
    for (const row of statsResult.data || []) {
      if (!latestByMember.has(row.member_id)) {
        latestByMember.set(row.member_id, row);
      } else if (!previousByMember.has(row.member_id)) {
        previousByMember.set(row.member_id, row);
      }
    }

    const summary = (membersResult.data || [])
      .filter((member) => !member.account_id || !pendingAccountIds.has(member.account_id))
      .map((member) => ({
        member_id: member.id,
        char_name: member.char_name,
        char_class: member.char_class,
        latest: latestByMember.get(member.id) || null,
        previous: previousByMember.get(member.id) || null
      }));

    return NextResponse.json({ stats: summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();
  if (isAdminRole(session.role)) {
    return NextResponse.json({ error: "Only a member's own account can submit their stats." }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const member = await findOwnMember(supabase, session);
    if (!member) return NextResponse.json({ error: "No linked character found for this account." }, { status: 404 });

    const payload = await request.json().catch(() => ({}));

    const { error: validationError, row: statsRow } = buildStatsRow(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { error: classError, class: effectiveClass } = await resolveEffectiveClass(supabase, member, payload.char_class);
    if (classError) return NextResponse.json({ error: classError }, { status: 400 });

    const row = {
      member_id: member.id,
      class: effectiveClass,
      ...statsRow
    };

    const { data, error } = await supabase
      .from("member_stats")
      .insert(row)
      .select(STATS_SELECT)
      .single();
    if (error) throw error;

    // Best-effort trim of older submissions — doesn't affect the response, so
    // it's deferred to run after the client already has its result.
    after(async () => {
      try {
        await enforceMemberStatsRetention(supabase, member.id);
      } catch (retentionError) {
        console.error("enforceMemberStatsRetention failed:", retentionError);
      }
    });

    await applyClassChangeIfNeeded(supabase, request, member, effectiveClass);

    await writeAuditLog(supabase, request, {
      action: "member_stats.submitted",
      targetType: "member_stats",
      targetId: data.id,
      summary: `Submitted stats for ${member.char_name}`,
      metadata: { member_id: member.id, submitted_at: data.submitted_at }
    });

    return NextResponse.json({ stats: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// Lets a member correct a mistake in their own most recent submission —
// the older kept row (see STATS_SELECT retention: latest 2 per member) is
// reference/comparison only and is never a target here, regardless of what
// the client sends, since "latest" is always resolved server-side.
export async function PATCH(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();
  if (isAdminRole(session.role)) {
    return NextResponse.json({ error: "Only a member's own account can edit their stats." }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const member = await findOwnMember(supabase, session);
    if (!member) return NextResponse.json({ error: "No linked character found for this account." }, { status: 404 });

    const { data: latest, error: latestError } = await supabase
      .from("member_stats")
      .select(STATS_SELECT)
      .eq("member_id", member.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest) return NextResponse.json({ error: "No stats submitted yet." }, { status: 404 });

    const payload = await request.json().catch(() => ({}));

    const { error: validationError, row: statsRow } = buildStatsRow(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { error: classError, class: effectiveClass } = await resolveEffectiveClass(supabase, member, payload.char_class);
    if (classError) return NextResponse.json({ error: classError }, { status: 400 });

    const { data, error } = await supabase
      .from("member_stats")
      .update({ class: effectiveClass, ...statsRow })
      .eq("id", latest.id)
      .select(STATS_SELECT)
      .single();
    if (error) throw error;

    await applyClassChangeIfNeeded(supabase, request, member, effectiveClass);

    await writeAuditLog(supabase, request, {
      action: "member_stats.updated",
      targetType: "member_stats",
      targetId: data.id,
      summary: `Edited stats for ${member.char_name}`,
      metadata: { member_id: member.id, before: latest, after: data }
    });

    return NextResponse.json({ stats: data });
  } catch (error) {
    return handleApiError(error);
  }
}
