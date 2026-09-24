# Promptly

Promptly turns rough ideas into prompts that are clear enough to use immediately. It includes prompt generation, focused optimization, prompt analysis, reusable templates, a lightweight playground, and a local prompt archive.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ngl-ankit/Promptly)

## Features

- Generate structured prompts from a short idea with OpenAI gpt-oss-20b via OpenRouter
- Optimize a prompt or apply a focused improvement
- Analyze clarity, structure, ambiguity, requirements, and output expectations
- Run a finished prompt in the playground
- Save, search, favorite, duplicate, restore, and delete prompts locally
- Recover the current draft after a refresh
- Light and dark themes with local preferences
- Responsive workspace with mobile navigation
- Accessible loading, empty, and error states

## Architecture

- React + Vite frontend in `artifacts/promptly`
- Express API in `artifacts/api-server`
- OpenAPI contract in `lib/api-spec/openapi.yaml`
- Generated React Query and Zod clients in `lib/api-client-react` and `lib/api-zod`
- Browser-local persistence; no user accounts or application database
- OpenRouter requests stay on the server. The API key is never sent to browser code.

## Local development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
```

The project workflows provide the frontend preview. To check the frontend package directly:

```bash
pnpm --filter @workspace/promptly run typecheck
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/promptly run build
```

## Environment variables

Copy `.env.example` into your local environment or configure the values in your hosting provider:

- `OPENROUTER_API_KEY` — preferred name for the OpenRouter API key
- `XAI_API_KEY` — legacy alias accepted for existing deployments; it must contain an OpenRouter key
- `OPENROUTER_MODEL` — configurable model name; defaults to `openai/gpt-oss-20b`
- `PORT` — server port
- `HOST` — bind host

## API routes

- `GET /api/healthz`
- `POST /api/generate`
- `POST /api/optimize`
- `POST /api/improve`
- `POST /api/analyze`
- `POST /api/playground`

## Testing and checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/promptly run typecheck
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/promptly run build
```

## Render deployment

Use the **Deploy to Render** button above. It opens Render's Blueprint flow for this repository; review the `promptly` web service and approve it to create the service from `render.yaml`. The blueprint builds the frontend and API, serves both from one web service, and checks `/api/healthz`.

The Render blueprint keeps the existing `XAI_API_KEY` secret name for deployments that already have the OpenRouter key stored there; the server prefers `OPENROUTER_API_KEY` when that variable is configured and falls back to `XAI_API_KEY`. `OPENROUTER_MODEL` defaults to `openai/gpt-oss-20b`. The app can start without an AI key, but AI requests will return an error until one of those server-side variables contains the OpenRouter key. Never commit the key.

The blueprint uses Node.js 24, pnpm 10, the `main` branch, and deploys future commits automatically. No application database is required; saved prompts remain in each user's browser.

## Limitations

- Prompt history is intentionally local to the current browser and device.
- Sharing is not included because it would require either a hosted store or a careful encrypted URL format.
- OpenRouter model availability can change; keep `OPENROUTER_MODEL` configurable.
