// Shared constants safe to import from both server (API routes) and the client
// component (components/DashboardApp.jsx) — plain values only, no secrets.

// Hard ceiling on guild roster size — matches the game's actual guild member cap.
// Unlike the old "roster limit" (a purely cosmetic, admin-adjustable display target
// stored in localStorage), this is enforced server-side and can never be raised past
// 80 from the UI.
export const GUILD_MEMBER_LIMIT = 80;
