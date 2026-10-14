# Vercel deployment

Import `ma1amin/Fikryon` as one Vercel project with the repository root as
the project's Root Directory. The root `vercel.json` defines three services.
Keep build settings in those service definitions, rather than adding top-level
build or runtime overrides.
Each service installs through Corepack with the pinned pnpm version, preserving
the lockfile and workspace install policies. The pnpm-only preinstall check uses
Node.js so installation works on both Windows and Linux.
Dependency install scripts use pnpm 11's `allowBuilds` map, preserving the
existing allowlist including esbuild. Validate installs without `--ignore-scripts`
to check this policy as well as the lockfile.

## Proposed routing (pending owner confirmation)

| Service | Public path | Entry/build output |
| --- | --- | --- |
| `api-server` | `/api` and `/api/*` | Express default export in `src/app.ts` |
| `fikryon-coming-soon` | `/` and all remaining paths | `dist/public` |
| `mockup-sandbox` | Internal only; no public rewrite | `dist` |

Service rewrites preserve the original request path. The API already mounts its
router at `/api`, so its health endpoint is `/api/healthz`. The generated browser
API client also uses `/api/healthz` on the same origin. The Vite services have
service-scoped SPA rewrites so client-side routes reach their HTML entrypoints.

The main site defaults to `BASE_PATH=/`. Vite no longer requires `PORT` or
`BASE_PATH` during builds. Existing environment overrides still work. If the
sandbox is made public under a prefix later, configure its Vite base to match
that prefix and route its HTML and assets into the sandbox service.

## Bindings and environment

No bindings are declared: no running server-side code currently calls another
service. The Vite applications are browser-only; bindings resolve in functions
at runtime and must never be embedded in a browser bundle or supplied manually.
The browser submits to `/api/subscribe`; the API writes subscriber and email-job
records in PostgreSQL and sends through Dynadot SMTP. Database and SMTP credentials
are server-only variables. The API health endpoint stays available before these
are configured. See [EMAIL_SETUP.md](EMAIL_SETUP.md) for migrations, environment
variables, controlled testing, retries, and launch-mailing operation.

## Local verification

Install dependencies with pnpm, then run:

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/fikryon-coming-soon run build
pnpm --filter @workspace/mockup-sandbox run build
vercel dev -L
```

`vercel dev -L` runs all services locally without a cloud login. Verify `/` loads
the website and `/api/healthz` returns `{"status":"ok"}`. Requests to `/api/*`
must stay with Express even when no API route matches. The sandbox has no public
ingress. Any future binding URL is injected by Vercel automatically.

References: [Services](https://vercel.com/docs/services),
[routing](https://vercel.com/docs/services/routing),
[bindings](https://vercel.com/docs/services/bindings).
