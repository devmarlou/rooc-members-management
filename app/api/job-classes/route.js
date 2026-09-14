import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { COLOR_GROUPS, JOB_CLASS_SELECT, mapJobClassRow, uploadJobClassIcon, validateIconFile } from "@/lib/jobClasses";

export async function POST(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const formData = await request.formData();
    const name = String(formData.get("name") || "").trim();
    const shortLabel = String(formData.get("short_label") || "").trim();
    const colorGroup = String(formData.get("color_group") || "gray").trim();
    const icon = formData.get("icon");

    if (!name) return NextResponse.json({ error: "Class name is required." }, { status: 400 });
    if (!shortLabel) return NextResponse.json({ error: "Short label is required." }, { status: 400 });
    if (!COLOR_GROUPS.includes(colorGroup)) {
      return NextResponse.json({ error: `Color group must be one of: ${COLOR_GROUPS.join(", ")}.` }, { status: 400 });
    }

    const hasIcon = icon && typeof icon === "object" && icon.size > 0;
    if (hasIcon) {
      const iconError = validateIconFile(icon);
      if (iconError) return NextResponse.json({ error: iconError }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    // The icon upload and the row count (used only to compute sort_order below)
    // don't depend on each other — run concurrently instead of sequentially.
    const [iconUrl, countResult] = await Promise.all([
      hasIcon ? uploadJobClassIcon(supabase, icon) : Promise.resolve(null),
      supabase.from("job_classes").select("id", { count: "exact", head: true })
    ]);
    const { count } = countResult;

    const { data, error } = await supabase
      .from("job_classes")
      .insert({
        name,
        short_label: shortLabel,
        color_group: colorGroup,
        icon_url: iconUrl,
        sort_order: (count || 0) * 10 + 10
      })
      .select(JOB_CLASS_SELECT)
      .single();

    if (error) throw error;
    await writeAuditLog(supabase, request, {
      action: "job_class.created",
      targetType: "job_class",
      targetId: data.id,
      summary: `Created job class ${data.name}`,
      metadata: { after: data }
    });

    return NextResponse.json({ jobClass: mapJobClassRow(data) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
