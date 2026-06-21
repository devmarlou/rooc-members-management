# AGENTS.md

Guidance for Codex CLI and other coding agents working in this repo.

## Read First

- Follow `.codex/instructions.md` before making changes.
- `codex/` is local-only scratch space and should stay ignored.
- `.codex/` is shared team configuration and should be committed.

## Project Shape

- Next.js App Router app.
- React UI lives under `app/` and `components/`.
- Backend API routes live under `app/api/**/route.js`.
- Shared backend helpers live under `lib/`.
- Supabase is the shared live data layer.

## Development Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

- Use `npm run build` as the main compile check.
- Use `npm run lint` for ESLint. Warnings may exist; new errors should be fixed.

## Shared Database

- Local development connects to the team-owned live Supabase database.
- Do not create new Supabase projects or commit SQL schema files.
- Treat mutations as real data changes.
- Ask before running scripts or actions that import, reset, delete, or bulk-update data.

## Change Style

- Prefer the smallest working change.
- Remove duplication before adding abstraction.
- Avoid new dependencies unless there is no simple existing option.
- Keep comments short and useful. Comment the general purpose of core logic, not every line.
- Preserve working behavior unless the task explicitly asks to change it.

## Commits

- Use semantic commits: `<type>(optional-scope): <summary>`.
- Examples: `fix: handle missing auction state`, `docs: update dev setup`, `refactor: share bootstrap loader`.
