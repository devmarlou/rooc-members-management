import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { captureAuctionSavepoint, latestAuctionSavepoint, restoreAuctionSavepoint } from "@/lib/auctionSavepoint";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function forbidden() {
  return NextResponse.json({ error: "Only admins can manage auction savepoints." }, { status: 403 });
}

function canManageSavepoints(session) {
  return ["admin", "super_admin"].includes(session?.role);
}

function savepointSummary(savepoint) {
  return savepoint
    ? {
      id: savepoint.id,
      created_at: savepoint.created_at,
      actor_username: savepoint.actor_username,
      counts: savepoint.counts
    }
    : null;
}

export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();
  if (!canManageSavepoints(session)) return forbidden();

  const supabase = getSupabaseAdmin();
  const savepoint = await latestAuctionSavepoint(supabase);
  return NextResponse.json({ savepoint: savepointSummary(savepoint) });
}

export async function POST(request) {
  const session = requireAuth(request);
  if (!session) return unauthorized();
  if (!canManageSavepoints(session)) return forbidden();

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action === "restore" ? "restore" : "save";
    const supabase = getSupabaseAdmin();

    if (action === "restore") {
      const savepoint = await latestAuctionSavepoint(supabase);
      if (!savepoint) {
        return NextResponse.json({ error: "No auction savepoint has been saved yet." }, { status: 404 });
      }

      const auctionState = await restoreAuctionSavepoint(supabase, savepoint.snapshot);
      await emitDashboardEvent(supabase, "auction_savepoint_restored");
      await writeAuditLog(supabase, request, {
        action: "auction.savepoint_restored",
        targetType: "auction_lineup",
        targetId: savepoint.snapshot.round.id,
        summary: "Restored auction savepoint",
        metadata: {
          savepointId: savepoint.id,
          savepointCreatedAt: savepoint.created_at,
          counts: savepoint.counts
        }
      });
      return NextResponse.json({ auctionState, savepoint: savepointSummary(savepoint) });
    }

    const { snapshot, counts } = await captureAuctionSavepoint(supabase);
    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        actor_user_id: session.userId || null,
        actor_username: session.username || "unknown",
        actor_role: session.role || "admin",
        action: "auction.savepoint_saved",
        target_type: "auction_lineup",
        target_id: snapshot.round.id,
        summary: "Saved auction savepoint",
        metadata: { snapshot, counts }
      })
      .select("id,created_at,actor_username")
      .single();
    if (error) throw error;

    await emitDashboardEvent(supabase, "auction_savepoint_saved");
    return NextResponse.json({
      savepoint: {
        id: data.id,
        created_at: data.created_at,
        actor_username: data.actor_username,
        counts
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unexpected server error" }, { status: 500 });
  }
}
