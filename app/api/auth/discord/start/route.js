import { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  buildDiscordAuthorizeUrl,
  createOAuthStateToken,
  generatePkcePair,
  generateState
} from "@/lib/discordOAuth";

export const runtime = "nodejs";

export async function GET() {
  const state = generateState();
  const { verifier, challenge } = generatePkcePair();
  const authorizeUrl = buildDiscordAuthorizeUrl({ state, codeChallenge: challenge });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, createOAuthStateToken({ state, codeVerifier: verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });
  return response;
}
