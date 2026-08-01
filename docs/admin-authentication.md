# Admin authentication

## Architecture

The editorial CMS uses Supabase Auth with the existing Next.js SSR clients. Admin routes are split into `(auth)` and `(protected)` route groups under `src/app/admin`. Public locale routes are unchanged and admin routes are never localized.

`requireAdminUser()` is the single server-side authorization guard. It is request-cached, so the protected layout and a child page can consume the same typed admin identity without repeating the Auth or profile query.

## Session flow

1. The application proxy refreshes the Supabase session and preserves refreshed cookies.
2. The login form submits to a Server Action using React `useActionState()`.
3. The action calls `signInWithPassword()` on the server.
4. Supabase's standard persistent SSR session behavior is used. The disabled, checked “Remember session” control is informational; no custom lifetime or storage is implemented.
5. Logout is a Server Action that calls `supabase.auth.signOut()` and redirects to `/admin/login`.

## Route protection

Middleware performs session maintenance only. It does not make role decisions. The `(protected)` layout calls `requireAdminUser()` before any protected UI renders. Anonymous users are redirected to the login page, expired sessions receive a dedicated recovery page, and rejected accounts receive safe 403 states.

## Authorization model

Access requires both of these server-verified conditions:

- The signed Supabase JWT contains `app_metadata.role` with `writer`, `editor`, or `admin`.
- The authenticated user's RLS-visible `profiles` row exists, is active, and has the same role as the JWT.

The JWT is the authorization source of truth; the profile is the application-account integrity check. Missing, inactive, mismatched, or unsupported accounts are denied. Client-provided role information is never trusted, and the service-role client is not used.

## Directory structure

```text
src/app/admin/
├── (auth)/
│   ├── login/
│   ├── forbidden/
│   ├── profile-inactive/
│   ├── role-mismatch/
│   ├── session-expired/
│   └── unauthorized/
├── (protected)/
│   ├── dashboard/
│   ├── layout.tsx
│   └── page.tsx
└── layout.tsx

src/features/admin/auth/
├── access-state.tsx
├── actions.ts
├── authorization.model.ts
├── authorization.model.test.mjs
├── login-form.tsx
└── server.ts
```

## Current scope

This milestone includes login, logout, persistent SSR sessions, role/profile validation, protected routing, and a lightweight dashboard. Story CRUD, categories, sources, analytics, settings, RSS, media, and notifications are intentionally not implemented.
