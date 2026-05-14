import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireAuth(request) {
  return isAuthed(request);
}

export function handleApiError(error) {
  const message = error?.message || "Unexpected server error";
  const missingConfig = message.includes("Supabase is not configured");
  return NextResponse.json({ error: message }, { status: missingConfig ? 503 : 500 });
}
