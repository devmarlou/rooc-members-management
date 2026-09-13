import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import {
  OAUTH_STATE_COOKIE,
  buildDiscordAuthorizeUrl,
  createOAuthStateToken,
  generatePkcePair,
  generateState
} from "@/lib/discordOAuth";

export const runtime = "nodejs";

// Same OAuth kickoff as app/api/auth/discord/start/route.js, but for an
// already-logged-in account connecting Discord rather than signing in — the
// state cookie carries intent="link" + the account id so the callback can
// branch into linking instead of its usual sign-in/registration-detection path.
export async function GET(request) {
  const session = requireAuth(request);
  // Reached via a plain <a href> navigation from "Your account", not fetch() —
  // a JSON 401 would render as raw text, so bounce to the login screen instead.
  if (!session) return NextResponse.redirect(new URL("/", request.url));

  const state = generateState();
  const { verifier, challenge } = generatePkcePair();
  const authorizeUrl = buildDiscordAuthorizeUrl({ state, codeChallenge: challenge });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    createOAuthStateToken({ state, codeVerifier: verifier, intent: "link", accountId: session.userId }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10
    }
  );
  return response;
}
