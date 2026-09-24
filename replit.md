# Promptly

Promptly turns rough ideas into useful, structured prompts with Grok, while keeping drafts and history local to the browser.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/promptly run dev` — run the Promptly frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `XAI_API_KEY` — server-side xAI credential

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Validation: Zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind CSS

## Where things live

- `artifacts/promptly` — Promptly web workspace and local-first UI state
- `artifacts/api-server/src/ai` — Grok client and prompt instructions
- `artifacts/api-server/src/routes/promptly.ts` — AI API handlers
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/api-client-react` / `lib/api-zod` — generated API hooks and validation

## Architecture decisions

- Browser storage is intentional: Promptly has no accounts, server-side history, or database.
- AI credentials remain on the API server; the browser only calls same-project API routes.
- Structured AI responses are parsed and validated before they reach the UI.

## Product

- Generate, optimize, improve, analyze, and run prompts through the Promptly workspace.
- Keep drafts, history, favorites, and preferences on the current device.

## User preferences

- Keep the interface fast, precise, dark-first in spirit, and useful without an account.

## Gotchas

- Regenerate API clients after changing `lib/api-spec/openapi.yaml`.
- Frontend production builds require `PORT` and `BASE_PATH` in the shell.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
