import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function POST(request) {
  const { username, password } = await request.json();
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "admin";

  if (username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, username });
  response.cookies.set(SESSION_COOKIE, createSessionToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
