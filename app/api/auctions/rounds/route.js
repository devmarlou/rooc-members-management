import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/api";

export async function POST(request) {
  if (!requireAdmin(request)) return unauthorized();

  return NextResponse.json({ error: "Starting new auction rounds is disabled for the permanent lineup." }, { status: 410 });
}
