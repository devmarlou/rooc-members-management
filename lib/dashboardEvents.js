export async function emitDashboardEvent(supabase, eventType = "dashboard_update") {
  const { error } = await supabase
    .from("dashboard_events")
    .insert({ event_type: eventType });

  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw error;
  }
}
