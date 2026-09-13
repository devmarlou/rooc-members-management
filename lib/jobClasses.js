// Shared constants/helpers for the job_classes table, used by both CRUD routes
// (app/api/job-classes/**) and lib/bootstrapData.js.

import { randomUUID } from "node:crypto";

export const JOB_CLASS_SELECT = "id,name,short_label,color_group,icon_url,sort_order,created_at";

// Fixed palette — matches the hex values in components/data.js's colorGroups,
// which stays static (not part of admin CRUD; only the class list itself is editable).
export const COLOR_GROUPS = ["red", "blue", "emerald", "yellow", "purple", "orange", "pink", "gray"];

export const ALLOWED_ICON_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_ICON_BYTES = 2 * 1024 * 1024; // 2MB

// Maps a job_classes row to the { name, short, group, icon } shape the app's
// existing UI code already expects from components/data.js's static classes array.
export function mapJobClassRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    short: row.short_label,
    group: row.color_group,
    icon: row.icon_url || "",
    sortOrder: row.sort_order
  };
}

export const JOB_CLASS_ICON_BUCKET = "job-class-icons";

const EXTENSION_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

// Returns an error message string if the file fails validation, otherwise null.
export function validateIconFile(file) {
  if (!ALLOWED_ICON_MIME_TYPES.includes(file.type)) return "Icon must be a PNG, JPEG, or WebP image.";
  if (file.size > MAX_ICON_BYTES) return "Icon must be 2MB or smaller.";
  return null;
}

// Uploads an already-validated icon file to Storage and returns its public URL.
export async function uploadJobClassIcon(supabase, file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `job-classes/${randomUUID()}.${EXTENSION_BY_MIME[file.type]}`;
  const { error } = await supabase.storage.from(JOB_CLASS_ICON_BUCKET).upload(path, buffer, { contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from(JOB_CLASS_ICON_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort delete of a previously-uploaded icon — never fatal to the caller.
export async function deleteJobClassIconIfOwned(supabase, iconUrl) {
  if (!iconUrl || !iconUrl.includes(`/${JOB_CLASS_ICON_BUCKET}/`)) return;
  const path = iconUrl.split(`/${JOB_CLASS_ICON_BUCKET}/`)[1];
  if (!path) return;
  try {
    await supabase.storage.from(JOB_CLASS_ICON_BUCKET).remove([path]);
  } catch (error) {
    console.error("Failed to delete job class icon from storage:", error);
  }
}
