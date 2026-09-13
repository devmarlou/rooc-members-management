import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  COLOR_GROUPS,
  JOB_CLASS_SELECT,
  deleteJobClassIconIfOwned,
  mapJobClassRow,
  uploadJobClassIcon,
  validateIconFile
} from "@/lib/jobClasses";

export async function PATCH(request, { params }) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const { id } = await params;
    const formData = await request.formData();

    const hasName = formData.has("name");
    const name = hasName ? String(formData.get("name") || "").trim() : null;
    if (hasName && !name) return NextResponse.json({ error: "Class name is required." }, { status: 400 });

    const hasShortLabel = formData.has("short_label");
    const shortLabel = hasShortLabel ? String(formData.get("short_label") || "").trim() : null;
    if (hasShortLabel && !shortLabel) return NextResponse.json({ error: "Short label is required." }, { status: 400 });

    const hasColorGroup = formData.has("color_group");
    const colorGroup = hasColorGroup ? String(formData.get("color_group") || "").trim() : null;
    if (hasColorGroup && !COLOR_GROUPS.includes(colorGroup)) {
      return NextResponse.json({ error: `Color group must be one of: ${COLOR_GROUPS.join(", ")}.` }, { status: 400 });
    }

    const icon = formData.get("icon");
    const hasIcon = icon && typeof icon === "object" && icon.size > 0;
    if (hasIcon) {
      const iconError = validateIconFile(icon);
      if (iconError) return NextResponse.json({ error: iconError }, { status: 400 });
    }
    const clearIcon = formData.get("remove_icon") === "true";

    const supabase = getSupabaseAdmin();

    const beforeResult = await supabase
      .from("job_classes")
      .select(JOB_CLASS_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (beforeResult.error) throw beforeResult.error;
    if (!beforeResult.data) return NextResponse.json({ error: "Job class not found." }, { status: 404 });

    const newIconUrl = hasIcon ? await uploadJobClassIcon(supabase, icon) : null;

    const { data: rpcResult, error: rpcError } = await supabase.rpc("update_job_class", {
      p_id: id,
      p_name: name,
      p_short_label: shortLabel,
      p_color_group: colorGroup,
      p_icon_url: newIconUrl,
      p_clear_icon: clearIcon
    });
    if (rpcError) throw rpcError;

    const { before, after, membersUpdated } = rpcResult;

    // Replacing/removing an icon orphans the old Storage object — clean it up
    // once the row itself has switched over successfully.
    if ((hasIcon || clearIcon) && before?.icon_url) {
      await deleteJobClassIconIfOwned(supabase, before.icon_url);
    }

    await writeAuditLog(supabase, request, {
      action: "job_class.updated",
      targetType: "job_class",
      targetId: id,
      summary: membersUpdated > 0
        ? `Renamed job class ${before.name} to ${after.name} (${membersUpdated} member${membersUpdated === 1 ? "" : "s"} updated)`
        : `Updated job class ${after.name}`,
      metadata: { before, after, membersUpdated }
    });

    return NextResponse.json({ jobClass: mapJobClassRow(after), membersUpdated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const beforeResult = await supabase
      .from("job_classes")
      .select(JOB_CLASS_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (beforeResult.error) throw beforeResult.error;
    if (!beforeResult.data) return NextResponse.json({ error: "Job class not found." }, { status: 404 });

    const { count, error: countError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("char_class", beforeResult.data.name);
    if (countError) throw countError;

    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `${count} member${count === 1 ? "" : "s"} use this class — reassign them first.` },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("job_classes").delete().eq("id", id);
    if (error) throw error;

    await deleteJobClassIconIfOwned(supabase, beforeResult.data.icon_url);

    await writeAuditLog(supabase, request, {
      action: "job_class.deleted",
      targetType: "job_class",
      targetId: id,
      summary: `Deleted job class ${beforeResult.data.name}`,
      metadata: { before: beforeResult.data }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
