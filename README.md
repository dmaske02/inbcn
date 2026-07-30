This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment variables

Copy `.env.example` to `.env.local` and fill in only the integrations you use:

```bash
cp .env.example .env.local
```

`NEXT_PUBLIC_APP_URL` is required in production. Integration variables are
optional until their corresponding integration is enabled. Variables prefixed
with `NEXT_PUBLIC_` are exposed to the browser; all other variables are
server-only secrets.

Never commit `.env.local` or any real credentials. Next.js loads `.env.local`
automatically during local development.

## Supabase clients

- `src/lib/supabase/browser.ts` creates the browser client with public URL and
  anon-key variables only.
- `src/lib/supabase/server.ts` creates a cookie-aware client for Server
  Components, Server Actions, and Route Handlers.
- `src/lib/supabase/admin.ts` creates a server-only service-role client for
  trusted administrative operations. Never import it into client code.
- `src/lib/supabase/middleware.ts` refreshes auth claims and propagates updated
  cookies and no-cache headers between the request, Server Components, and the
  browser.

The session refresh helper is intentionally not connected to `src/proxy.ts`
until authentication is implemented. When it is connected, its cookies and
cache headers must be merged into the next-intl response so locale rewrites and
redirects remain intact.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
