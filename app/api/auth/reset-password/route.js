import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { createSessionToken, sessionDurationSeconds, SESSION_COOKIE } from "@/lib/session";
import { validatePassword } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  const session = requireAuth(request, { allowPasswordReset: true });
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    const { error: passwordError } = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: "New password must be different from the current password." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("reset_app_user_password", {
      input_user_id: session.userId,
      input_current_password: currentPassword,
      input_new_password: newPassword
    });
    if (error) throw error;

    const user = Array.isArray(data) ? data[0] : data;
    if (!user) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionDurationSeconds(session.role) // mirrors the token exp in lib/session.js
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
