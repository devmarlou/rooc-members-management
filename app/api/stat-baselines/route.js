import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import {
  buildStatSettingRows,
  fetchStatSettings,
  isMissingCompareColumn,
  isMissingTable
} from "@/lib/statBaselines";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Public read: the registration form (pre-auth) and member pages both show
// each stat's base and comparison, and the values aren't sensitive.
export async function GET() {
  try {
    const settings = await fetchStatSettings(getSupabaseAdmin());
    return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const { error: validationError, rows } = buildStatSettingRows(body.baselines, body.compare);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const before = await fetchStatSettings(supabase);

    const { error } = await supabase.from("stat_baselines").upsert(rows, { onConflict: "stat_key" });
    if (isMissingTable(error) || isMissingCompareColumn(error)) {
      return NextResponse.json(
        { error: "stat_baselines isn't fully set up yet. Run its blocks in .codex/MEMBER_STATS_RUNBOOK.md." },
        { status: 503 }
      );
    }
    if (error) throw error;

    const updated = await fetchStatSettings(supabase);
    emitDashboardEvent(supabase, "stat_baselines.updated");
    await writeAuditLog(supabase, request, {
      action: "stat_baselines.updated",
      targetType: "stat_baselines",
      targetId: null,
      summary: "Updated base stats",
      metadata: { before, after: updated }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
