import { getSession } from "@/lib/session";

export async function writeAuditLog(supabase, request, entry) {
  const session = getSession(request);
  if (!session) return;

  const row = {
    actor_user_id: session.userId || null,
    actor_username: session.username || "unknown",
    actor_role: session.role || "admin",
    action: entry.action,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    summary: entry.summary || null,
    metadata: entry.metadata || {}
  };

  const { error } = await supabase.from("audit_logs").insert(row);
  if (error) {
    console.error("Audit log insert failed", error);
  }
}
