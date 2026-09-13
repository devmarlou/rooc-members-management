import { NextResponse } from "next/server";
import { createSessionToken, sessionDurationSeconds, SESSION_COOKIE } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  const { username, password } = await request.json();
  const identifier = String(username || "").trim().toLowerCase();

  const supabase = getSupabaseAdmin();

  try {
    const rateLimit = await checkRateLimit(supabase, {
      scope: "login",
      identifier,
      maxAttempts: 8,
      windowSeconds: 60 * 15,
      lockoutSeconds: 60 * 15
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    }
  } catch (rateLimitError) {
    console.warn("Rate limit check failed, allowing login through:", rateLimitError?.message);
  }

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

  // verify_app_user_login predates the Discord `status` column (see
  // DISCORD_AUTH_IMPLEMENTATION_PLAN.md) and its hand-verified body isn't
  // duplicated here, so a disabled account is caught with a follow-up check
  // instead of risking a guessed rewrite of that function.
  const { data: statusRow } = await supabase
    .from("app_users")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (statusRow?.status === "disabled") {
    return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
  }
  if (statusRow?.status === "pending") {
    return NextResponse.json({ error: "Your registration is awaiting admin approval." }, { status: 403 });
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
    maxAge: sessionDurationSeconds(user.role) // mirrors the token exp in lib/session.js
  });
  return response;
}
