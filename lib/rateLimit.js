// Thin wrapper around the check_rate_limit Postgres RPC (see DISCORD_AUTH_IMPLEMENTATION_PLAN.md).
// Fails open if the RPC isn't installed yet, so login/registration keep working
// on a Supabase project that hasn't had the rate-limit migration applied.
function isMissingRateLimitRpc(error) {
  const message = String(error?.message || "");
  return error?.code === "42883" || error?.code === "PGRST202" || message.includes("check_rate_limit");
}

export async function checkRateLimit(supabase, { scope, identifier, maxAttempts, windowSeconds, lockoutSeconds }) {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_scope: scope,
    p_identifier: identifier,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
    p_lockout_seconds: lockoutSeconds
  });

  if (error) {
    if (isMissingRateLimitRpc(error)) {
      console.warn("check_rate_limit RPC is not installed yet; skipping rate limiting for this request.");
      return { allowed: true, retryAfterSeconds: 0 };
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed ?? true),
    retryAfterSeconds: Number(row?.retry_after_seconds || 0)
  };
}
