import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { buildBaselineRows, fetchStatBaselines } from "@/lib/statBaselines";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Public read: the registration form (pre-auth) and member pages both show
// each stat's base, and the values aren't sensitive.
export async function GET() {
  try {
    const baselines = await fetchStatBaselines(getSupabaseAdmin());
    return NextResponse.json({ baselines }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const { error: validationError, rows } = buildBaselineRows(body.baselines);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const before = await fetchStatBaselines(supabase);

    if (rows.length > 0) {
      const { error } = await supabase.from("stat_baselines").upsert(rows, { onConflict: "stat_key" });
      if (error?.code === "42P01" || error?.code === "PGRST205") {
        return NextResponse.json(
          { error: "The stat_baselines table doesn't exist yet. Run its block in .codex/MEMBER_STATS_RUNBOOK.md." },
          { status: 503 }
        );
      }
      if (error) throw error;
    }

    const updated = await fetchStatBaselines(supabase);
    emitDashboardEvent(supabase, "stat_baselines.updated");
    await writeAuditLog(supabase, request, {
      action: "stat_baselines.updated",
      targetType: "stat_baselines",
      targetId: null,
      summary: "Updated base stats",
      metadata: { before, after: updated }
    });

    return NextResponse.json({ baselines: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
