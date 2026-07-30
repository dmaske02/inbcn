# Phase 1 Row Level Security

The policies are defined in
`supabase/migrations/20260730010000_phase_1_rls.sql`.

Application roles are read from the signed `app_metadata.role` JWT claim.
User-editable `user_metadata` is never trusted for authorization. Authentication
provisioning must keep `app_metadata.role` and `profiles.role` synchronized.
Users without an application role claim are treated as readers for self-profile
updates and receive no editorial privileges.

## Access model

- `languages`: anonymous and authenticated users can read enabled languages;
  admins manage all rows.
- `categories`: anonymous and authenticated users can read active categories;
  admins manage all rows.
- `sources`: the public can read active source metadata; editors and admins have
  full CRUD access.
- `profiles`: authenticated users can read and update their own active profile
  without changing their identity or role; admins have full access.
- `stories`: the public can read published stories. Writers can create drafts,
  read all of their own stories, update drafts, and submit them for review.
  After submission, writers can no longer edit them. Editors can read every
  story and perform review, scheduling, rejection, and publication updates.
  Admins have full CRUD access.
- `media`: public visibility requires a published parent story. Writers can
  manage media only on their own drafts. Editors and admins manage all media.
- `ingest_runs`: only editors and admins can access or manage ingestion history.
- `push_subscriptions`: authenticated users manage rows tied to their own
  profile. Admins can additionally read all subscriptions.

## Security notes

- RLS is enabled on every Phase 1 table.
- Anonymous access has explicit `SELECT` grants only for public-facing data.
- Anonymous writes, profile enumeration, draft access, ingestion access, and
  push-subscription access are denied.
- Authenticated roles receive only row-oriented CRUD grants; `TRUNCATE` is not
  granted.
- The `service_role` retains privileged server-side access and must never be
  exposed to browsers.
- Storage policies remain outside Phase 1.
