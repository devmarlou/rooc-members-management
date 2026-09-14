import { after } from "next/server";

// Called after every mutation that should propagate live (see CLAUDE.md's
// standard route shape) — its only job is to tell already-open clients to
// refetch, so the caller's own response doesn't need to wait on it. Deferred
// via after(); a failure here now logs instead of failing the route's response
// (the mutation itself already succeeded by the time this runs — the caller
// shouldn't see an error for a live-notify insert failing after the fact).
export function emitDashboardEvent(supabase, eventType = "dashboard_update") {
  after(async () => {
    const { error } = await supabase
      .from("dashboard_events")
      .insert({ event_type: eventType });

    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("emitDashboardEvent insert failed", error);
    }
  });
}
