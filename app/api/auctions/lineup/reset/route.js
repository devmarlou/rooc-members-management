import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/api";

export async function POST(request) {
  if (!requireAdmin(request)) return unauthorized();

  return NextResponse.json({ error: "Auction lineup reset is disabled for the permanent lineup." }, { status: 410 });
}
