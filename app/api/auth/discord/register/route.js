import { NextResponse, after } from "next/server";
import { PENDING_REGISTRATION_COOKIE, verifyPendingRegistrationToken } from "@/lib/discordOAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildStatsRow } from "@/lib/memberStats";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { GUILD_MEMBER_LIMIT } from "@/lib/constants";

export const runtime = "nodejs";

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function friendlyRegistrationError(message) {
  if (message.includes("discord_already_linked")) return "This Discord account is already registered.";
  if (message.includes("username_taken")) return "That username is already taken.";
  if (message.includes("char_name_taken")) return "That character name is already taken.";
  return null;
}

export async function POST(request) {
  const pendingToken = request.cookies.get(PENDING_REGISTRATION_COOKIE)?.value;
  const pending = verifyPendingRegistrationToken(pendingToken);
  if (!pending?.discordUserId) {
    return NextResponse.json({ error: "Registration session expired. Please start over." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
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
  // before register_member_account runs so an invalid/missing submission blocks
  // account creation outright, rather than creating an account with no stats on file.
  const { error: statsValidationError, row: statsRow } = buildStatsRow(body.stats);
  if (statsValidationError) {
    return NextResponse.json({ error: statsValidationError }, { status: 400 });
  }

  // register_member_account inserts the members row immediately (it just sits
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
    const { data, error } = await supabase.rpc("register_member_account", {
      p_username: username,
      p_password: password,
      p_discord_user_id: pending.discordUserId,
      p_char_name: charName,
      p_char_class: charClass
    });

    if (error) {
      console.error("[discord/register] register_member_account RPC failed:", error);
      const message = String(error.message || "");
      const missingRpc = message.includes("register_member_account");
      const friendly = friendlyRegistrationError(message);
      if (friendly) {
        return NextResponse.json({ error: friendly }, { status: 409 });
      }
      return NextResponse.json({
        error: missingRpc
          ? "Discord registration is not installed yet. Run the latest Supabase migration."
          : "Could not complete registration."
      }, { status: missingRpc ? 503 : 500 });
    }

    const user = Array.isArray(data) ? data[0] : data;
    if (!user) {
      return NextResponse.json({ error: "Could not complete registration." }, { status: 500 });
    }

    // New accounts land as status='pending' (set inside register_member_account) —
    // no session cookie yet and no active-round enrollment yet. Both happen only
    // once an admin approves the account (see app/api/members/pending/[id]/route.js).
    //
    // None of this follow-up (audit log, best-effort stats insert + its own audit
    // log) is needed to answer the request — the account is already created by
    // register_member_account above — so it's deferred via after() to run once the
    // response has been sent instead of making the submitter wait through 4 more
    // sequential round trips for a form that already succeeded.
    after(async () => {
      const { error: auditError } = await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        actor_username: user.username,
        actor_role: user.role,
        action: "account.registered_via_discord",
        target_type: "app_user",
        target_id: user.id,
        summary: `Registered new member account ${user.username} via Discord (pending approval)`,
        metadata: { discordUserId: pending.discordUserId }
      });
      if (auditError) console.error("[discord/register] audit log insert failed:", auditError);

      // Best-effort follow-up, mirroring enrollMemberInActiveRound in
      // app/api/members/pending/[id]/route.js: the atomic boundary is
      // register_member_account above, so a failure here logs loudly but does
      // not fail the overall registration response (the account already exists).
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
          if (statsAuditError) console.error("[discord/register] stats audit log insert failed:", statsAuditError);
        } else {
          console.error("[discord/register] stats insert failed: no members row found for account", user.id);
        }
      } catch (statsError) {
        console.error("[discord/register] stats insert failed:", statsError);
      }
    });

    const response = NextResponse.json({
      ok: true,
      status: "pending",
      username: user.username
    }, { status: 201 });
    response.cookies.delete(PENDING_REGISTRATION_COOKIE);
    return response;
  } catch (registrationError) {
    console.error("[discord/register] unhandled failure:", registrationError);
    return NextResponse.json({ error: "Could not complete registration." }, { status: 500 });
  }
}
