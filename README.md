# INBCN monorepo

INBCN is split into three independently deployable Next.js 16 applications that share one Supabase project and migration history.

| Application | Workspace | Vercel root | Production domain |
| --- | --- | --- | --- |
| Public website | `website/` | `website` | `https://inbcn.com` |
| CMS/admin | `cms/` | `cms` | `https://cms.inbcn.com` |
| Reporter portal | `reporter/` | `reporter` | Configure before production launch |

Shared generated database types live in `packages/database`; pure cross-application contracts live in `packages/domain`. Database migrations remain canonical in the root `supabase/` directory.

## Local validation

Install once from the repository root with `npm install`. Run all checks with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Each application can also be validated independently from its directory with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Environment configuration

Use [`website/.env.example`](website/.env.example) and [`cms/.env.example`](cms/.env.example) as their Vercel environment-variable inventories. The reporter portal configuration and rollout checklist are documented in [`docs/reporter-portal-handover.md`](docs/reporter-portal-handover.md). Never expose service-role or provider secrets through `NEXT_PUBLIC_*` variables.

## Deployment notes

- Create three Vercel projects from this repository with root directories `website`, `cms`, and `reporter`.
- The CMS owns the protected `/admin/*` tree, protected Homepage Builder preview, ingestion endpoint, and `cms/vercel.json` cron schedule.
- The website owns localized public routes and the secret-protected `POST /api/revalidate` endpoint.
- Set the same `WEBSITE_REVALIDATION_SECRET` in both Vercel projects and set CMS `WEBSITE_URL=https://inbcn.com`.
- Add `https://cms.inbcn.com/**` (and the corresponding preview URLs used for testing) to Supabase Auth redirect allowlists. The public website does not own CMS login callbacks.
- A 30-minute Vercel Cron schedule requires a plan that supports more than one daily invocation. On Hobby, trigger ingestion using an approved external scheduler or change the schedule explicitly; do not leave an unsupported schedule assumed to run.
