import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function GET(request) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({
    authenticated: Boolean(session),
    username: session?.username || null,
    role: session?.role || null,
    mustResetPassword: Boolean(session?.mustResetPassword)
  });
}
