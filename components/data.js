// Job classes are admin-editable and live in the `job_classes` Supabase table
// (see lib/jobClasses.js + JobClassesContext in DashboardApp.jsx). The color
// palette below is the fixed set of swatches classes can be grouped under —
// it's not part of that CRUD surface, so it stays static here.
export const colorGroups = {
  red: "#ef4444",
  blue: "#3b82f6",
  emerald: "#10b981",
  yellow: "#eab308",
  purple: "#8b5cf6",
  orange: "#f97316",
  pink: "#ec4899",
  gray: "#71717a"
};
