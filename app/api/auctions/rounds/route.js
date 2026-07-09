import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  return NextResponse.json({ error: "Starting new auction rounds is disabled for the permanent lineup." }, { status: 410 });
}
