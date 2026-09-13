import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import {
  OAUTH_STATE_COOKIE,
  PENDING_REGISTRATION_COOKIE,
  createPendingRegistrationToken,
  exchangeDiscordCode,
  fetchDiscordIdentity,
  verifyOAuthStateToken
} from "@/lib/discordOAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function redirectToLogin(request, authError) {
  // This app has no dedicated /login route — "/" renders the login screen
  // whenever the session is unauthenticated (see DashboardApp.jsx).
  const url = new URL("/", request.url);
  if (authError) url.searchParams.set("authError", authError);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

function landingPathForRole(role) {
  return role === "admin" || role === "super_admin" ? "/" : "/account";
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");

  const stateToken = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const stateData = verifyOAuthStateToken(stateToken);

  if (!code || !stateData || stateData.state !== returnedState) {
    return redirectToLogin(request, "discord_state_invalid");
  }

  try {
    const tokenResponse = await exchangeDiscordCode({ code, codeVerifier: stateData.codeVerifier });
    const identity = await fetchDiscordIdentity(tokenResponse.access_token);
    const discordUserId = identity.id;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("discord_lookup_account", {
      p_discord_user_id: discordUserId
    });
    if (error) throw error;

    const account = Array.isArray(data) ? data[0] : data;

    if (account) {
      if (account.status === "disabled") {
        return redirectToLogin(request, "account_disabled");
      }
      if (account.status === "pending") {
        return redirectToLogin(request, "account_pending");
      }

      const response = NextResponse.redirect(new URL(landingPathForRole(account.role), request.url));
      response.cookies.delete(OAUTH_STATE_COOKIE);
      response.cookies.set(SESSION_COOKIE, createSessionToken(account), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12
      });
      return response;
    }

    // No linked account yet — a single "Continue with Discord" button covers both
    // sign-in and registration, so fall through to the registration-completion form.
    const response = NextResponse.redirect(new URL("/?registerStep=complete", request.url));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.set(PENDING_REGISTRATION_COOKIE, createPendingRegistrationToken({ discordUserId }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15
    });
    return response;
  } catch (callbackError) {
    const message = String(callbackError?.message || "");
    const missingRpc = message.includes("discord_lookup_account");
    console.error("Discord OAuth callback failed:", callbackError);
    return redirectToLogin(request, missingRpc ? "discord_not_installed" : "discord_failed");
  }
}
