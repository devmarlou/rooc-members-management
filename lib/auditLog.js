import { after } from "next/server";
import { getSession } from "@/lib/session";

// Called after nearly every mutating route (see CLAUDE.md's standard route
// shape), but its result is never read by any caller — it's a pure side-effect
// log entry. Deferred via after() so every one of those routes stops waiting on
// this insert before responding; callers can keep `await`ing this (awaiting a
// non-promise is a no-op) without any change on their end.
export function writeAuditLog(supabase, request, entry) {
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

  after(async () => {
    const { error } = await supabase.from("audit_logs").insert(row);
    if (error) {
      console.error("Audit log insert failed", error);
    }
  });
}
