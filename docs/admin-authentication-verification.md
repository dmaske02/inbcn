# Admin authentication verification

Verified on 1 August 2026 against the linked Supabase project `uoykitlsdawvpqfjeuqm`.

## Test identity

One confirmed development-only Auth user was created because the project contained no Auth users. Its email is `admin@inbcn.local`; its generated password is stored only in the ignored `.env.local` file and is not committed or included in logs.

The account was restored after testing with:

- signed `app_metadata.role`: `admin`
- profile role: `admin`
- profile state: active
- display name: `INBCN Development Admin`
- preferred language: English (`en`)

## Authentication flow

1. An anonymous request to `/admin` is redirected to `/admin/login`.
2. The login form submits to a Server Action using `signInWithPassword()`.
3. Invalid credentials return a generic error without exposing Supabase details.
4. Valid credentials are checked by the server authorization service before redirecting to `/admin/dashboard`.
5. The standard Supabase SSR session persists across a browser refresh.
6. The logout Server Action calls `signOut()`, redirects to `/admin/login`, and the protected dashboard redirects back to login afterward.

## Authorization flow

`requireAdminUser()` accepts an account only when the signed JWT role is `writer`, `editor`, or `admin` and the authenticated user's RLS-visible profile exists, is active, and contains the same role. Middleware refreshes sessions but does not make authorization decisions.

For integrity testing, the single development account was moved through each role/profile state using the Supabase administrative API, tested through the application, and restored after each destructive state. No schema, migration, RLS, or policy changes were made.

## Test matrix

| Case | Expected result | Result |
| --- | --- | --- |
| Anonymous `/admin` | `/admin/login` | Pass |
| Invalid credentials | Safe login error | Pass |
| Writer JWT + active writer profile | `/admin/dashboard` | Pass |
| Editor JWT + active editor profile | `/admin/dashboard` | Pass |
| Admin JWT + active admin profile | `/admin/dashboard` | Pass |
| Inactive matching profile | `/admin/profile-inactive` | Pass |
| Missing profile | `/admin/forbidden` | Pass |
| JWT/profile role mismatch | `/admin/role-mismatch` | Pass |
| Invalid/expired session token | `/admin/session-expired` | Pass |
| Browser refresh after login | Session remains authenticated | Pass |
| Logout | Session cleared and `/admin/login` shown | Pass |
| Protected route after logout | `/admin/login` | Pass |

The invalid-session case used an isolated malformed session cookie in an HTTP request; no real browser session or account token was exposed.

## Validation results

- Authorization model tests: 3 passed, 0 failed
- TypeScript: passed
- ESLint: passed
- Next.js production build: passed
- Git whitespace validation: passed

## Remaining issues

Next.js reports a non-blocking workspace-root warning because another `package-lock.json` exists above the repository. It does not affect compilation, routing, authentication, or the production build.
