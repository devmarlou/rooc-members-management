import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  const { username, password } = await request.json();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("verify_app_user_login", {
      input_username: String(username || "").trim(),
      input_password: String(password || "")
    });

  if (error) {
    const message = String(error.message || "");
    const missingAuthTables = message.includes("verify_app_user_login") || message.includes("app_users");
    return NextResponse.json({
      error: missingAuthTables
        ? "App user login is not installed yet. Run the latest Supabase auth/audit migration."
        : "Could not verify login."
    }, { status: missingAuthTables ? 503 : 500 });
  }

  const user = Array.isArray(data) ? data[0] : data;
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    username: user.username,
    role: user.role,
    mustResetPassword: Boolean(user.must_reset_password)
  });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
