import { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  buildDiscordAuthorizeUrl,
  createOAuthStateToken,
  generatePkcePair,
  generateState
} from "@/lib/discordOAuth";

export const runtime = "nodejs";

// `?intent=reset` is the login screen's "Forgot password?" path: the callback
// then signs the linked account in only to set a new password.
export async function GET(request) {
  const intent = new URL(request.url).searchParams.get("intent") === "reset" ? "reset" : undefined;
  const state = generateState();
  const { verifier, challenge } = generatePkcePair();
  const authorizeUrl = buildDiscordAuthorizeUrl({ state, codeChallenge: challenge });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, createOAuthStateToken({ state, codeVerifier: verifier, intent }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });
  return response;
}
