import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildStatsRow } from "@/lib/memberStats";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { GUILD_MEMBER_LIMIT } from "@/lib/constants";

export const runtime = "nodejs";

// Local registration's counterpart to app/api/auth/discord/register/route.js —
// same validation/audit/retention shape, minus anything Discord-related (no
// pending-registration cookie to read, since there's no Discord identity here).

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function friendlyRegistrationError(message) {
  if (message.includes("username_taken")) return "That username is already taken.";
  if (message.includes("char_name_taken")) return "That character name is already taken.";
  return null;
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();

  try {
    // Same shared rate-limit bucket as Discord registration (scope "register",
    // keyed by client IP) — either path counts toward the same per-IP cap.
    const rateLimit = await checkRateLimit(supabase, {
      scope: "register",
      identifier: clientIp(request),
      maxAttempts: 5,
      windowSeconds: 60 * 60,
      lockoutSeconds: 60 * 60
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many registration attempts. Try again later." }, { status: 429 });
    }
  } catch (rateLimitError) {
    console.warn("Rate limit check failed, allowing registration through:", rateLimitError?.message);
  }

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const charName = String(body.charName || "").trim();
  const charClass = String(body.charClass || "").trim();

  if (!username || !password || !charName || !charClass) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  // Initial stats are required as part of registration — validate the payload
  // before register_local_account runs so an invalid/missing submission blocks
  // account creation outright, rather than creating an account with no stats on file.
  const { error: statsValidationError, row: statsRow } = buildStatsRow(body.stats);
  if (statsValidationError) {
    return NextResponse.json({ error: statsValidationError }, { status: 400 });
  }

  // register_local_account inserts the members row immediately (it just sits
  // "pending" until approved), so it counts against the roster cap right away.
  const { count: rosterCount, error: rosterCountError } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true });
  if (!rosterCountError && (rosterCount || 0) >= GUILD_MEMBER_LIMIT) {
    return NextResponse.json(
      { error: "The guild roster is full. Registration is closed until a slot opens up." },
      { status: 409 }
    );
  }

  try {
    const { data, error } = await supabase.rpc("register_local_account", {
      p_username: username,
      p_password: password,
      p_char_name: charName,
      p_char_class: charClass
    });

    if (error) {
      console.error("[auth/register] register_local_account RPC failed:", error);
      const message = String(error.message || "");
      const missingRpc = message.includes("register_local_account");
      const friendly = friendlyRegistrationError(message);
      if (friendly) {
        return NextResponse.json({ error: friendly }, { status: 409 });
      }
      return NextResponse.json({
        error: missingRpc
          ? "Local registration is not installed yet. Run the latest Supabase migration."
          : "Could not complete registration."
      }, { status: missingRpc ? 503 : 500 });
    }

    const user = Array.isArray(data) ? data[0] : data;
    if (!user) {
      return NextResponse.json({ error: "Could not complete registration." }, { status: 500 });
    }

    // New accounts land as status='pending' (set inside register_local_account) —
    // no session cookie yet and no active-round enrollment yet. Both happen only
    // once an admin approves the account (see app/api/members/pending/[id]/route.js).
    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_username: user.username,
      actor_role: user.role,
      action: "account.registered_local",
      target_type: "app_user",
      target_id: user.id,
      summary: `Registered new member account ${user.username} (pending approval)`,
      metadata: {}
    });
    if (auditError) console.error("[auth/register] audit log insert failed:", auditError);

    // Best-effort follow-up, mirroring app/api/auth/discord/register/route.js: the
    // atomic boundary is register_local_account above, so a failure here logs
    // loudly but does not fail the overall registration response.
    try {
      const { data: memberRow, error: memberLookupError } = await supabase
        .from("members")
        .select("id")
        .eq("account_id", user.id)
        .maybeSingle();
      if (memberLookupError) throw memberLookupError;

      if (memberRow) {
        const { data: statsData, error: statsInsertError } = await supabase
          .from("member_stats")
          .insert({ member_id: memberRow.id, class: charClass, ...statsRow })
          .select("id,submitted_at")
          .single();
        if (statsInsertError) throw statsInsertError;

        const { error: statsAuditError } = await supabase.from("audit_logs").insert({
          actor_user_id: user.id,
          actor_username: user.username,
          actor_role: user.role,
          action: "member_stats.submitted",
          target_type: "member_stats",
          target_id: statsData.id,
          summary: `Submitted initial stats for ${charName} during registration`,
          metadata: { member_id: memberRow.id, submitted_at: statsData.submitted_at }
        });
        if (statsAuditError) console.error("[auth/register] stats audit log insert failed:", statsAuditError);
      } else {
        console.error("[auth/register] stats insert failed: no members row found for account", user.id);
      }
    } catch (statsError) {
      console.error("[auth/register] stats insert failed:", statsError);
    }

    return NextResponse.json({
      ok: true,
      status: "pending",
      username: user.username
    }, { status: 201 });
  } catch (registrationError) {
    console.error("[auth/register] unhandled failure:", registrationError);
    return NextResponse.json({ error: "Could not complete registration." }, { status: 500 });
  }
}
