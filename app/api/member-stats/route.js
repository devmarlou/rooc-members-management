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
    const [membersResult, statsResult] = await Promise.all([
      supabase.from("members").select("id,char_name,char_class").order("char_name", { ascending: true }),
      supabase
        .from("member_stats")
        .select(STATS_SELECT)
        .order("submitted_at", { ascending: false })
    ]);
    if (membersResult.error) throw membersResult.error;
    if (statsResult.error) throw statsResult.error;

    const latestByMember = new Map();
    for (const row of statsResult.data || []) {
      if (!latestByMember.has(row.member_id)) latestByMember.set(row.member_id, row);
    }

    const summary = (membersResult.data || []).map((member) => ({
      member_id: member.id,
      char_name: member.char_name,
      char_class: member.char_class,
      latest: latestByMember.get(member.id) || null
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

    // A stats submission can also change the member's roster class (e.g. a
    // reclass) — validate against the live job_classes list before trusting it.
    const requestedClass = String(payload.char_class || "").trim();
    let effectiveClass = member.char_class;
    if (requestedClass && requestedClass !== member.char_class) {
      const { data: classRow, error: classError } = await supabase
        .from("job_classes")
        .select("name")
        .eq("name", requestedClass)
        .maybeSingle();
      if (classError) throw classError;
      if (!classRow) {
        return NextResponse.json({ error: "Invalid class selected." }, { status: 400 });
      }
      effectiveClass = requestedClass;
    }

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

    if (effectiveClass !== member.char_class) {
      const { error: classUpdateError } = await supabase
        .from("members")
        .update({ char_class: effectiveClass })
        .eq("id", member.id);
      if (classUpdateError) throw classUpdateError;

      await writeAuditLog(supabase, request, {
        action: "member.updated",
        targetType: "member",
        targetId: member.id,
        summary: `${member.char_name} changed class from ${member.char_class} to ${effectiveClass} via stats submission`,
        metadata: { before: { char_class: member.char_class }, after: { char_class: effectiveClass } }
      });
    }

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
