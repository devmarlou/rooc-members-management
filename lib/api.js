import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireAuth(request, options = {}) {
  const session = getSession(request);
  if (!session) return null;
  if (session.mustResetPassword && !options.allowPasswordReset) return null;
  return session;
}

export function requireRole(request, role) {
  const session = requireAuth(request);
  if (!session || session.role !== role) return null;
  return session;
}

export function handleApiError(error) {
  const message = error?.message || "Unexpected server error";
  const missingConfig = message.includes("Supabase is not configured");
  return NextResponse.json({ error: message }, { status: missingConfig ? 503 : 500 });
}
