# INBCN Media Library Phase 5 — Milestone 8 Retirement Design

## Status and scope

This document is the approved design for Milestone 8. It is intentionally limited to usage visibility, safe retirement, and restoration. It does not authorize implementation in this turn.

Milestone 8 will not permanently delete a `public.media` row, destroy a Cloudinary object, introduce a retention window, create cleanup jobs, or create `media_usages`. Existing `deleted_at` and `deleted_by` columns represent retirement.

## Problem

The current delete path checks Story references in application code, deletes the database row, and then calls Cloudinary. That sequence is not transactionally safe: a Story can acquire the media after the count, and a provider failure can leave the database and Cloudinary out of sync. The UI also exposes only a reference count and cannot explain which Stories or indirect Homepage Builder placements use an asset.

Milestone 8 must answer two questions from authoritative data:

1. Which current content references this media?
2. Can it be retired without breaking published or editorial content?

## Repository findings

| Consumer | Reference | Storage | FK? | Existing usage detection? |
|---|---|---|---|---|
| Stories | `stories.featured_media_id -> media.id` | nullable UUID column | Yes, `ON DELETE SET NULL` | Yes, count query only |
| Media ownership compatibility | `media.story_id -> stories.id` | nullable UUID column | Yes, `ON DELETE SET NULL` after the relationship migration | No lifecycle decision uses it; new reusable assets write `null` |
| Homepage Builder Hero Story | `configuration.storyId -> stories.id` | validated JSON UUID | No database FK | Indirect only through the selected Story |
| Homepage Builder Hero Sidebar | `configuration.storyIds[] -> stories.id` | validated JSON UUID array | No database FK | Indirect only through selected Stories |
| Homepage Builder Category | `configuration.categoryId` | validated JSON UUID | No media relationship | Resolves Stories, then their featured media |
| Breaking/Latest/Trending/Opinion | configured result limit | JSON number | No media relationship | Resolve Story collections |
| Advertisement | `configuration.label` | JSON text | No media relationship | None |
| Live TV | `poster_url`, `social_image_url` | external HTTPS strings | No | Outside Media Library |
| Story imports | `external_image_url` | external HTTPS string | No | Fallback, not canonical media usage |
| Profiles | `avatar_url` | external URL | No | Outside Media Library |

Searches found no current canonical media UUID in Homepage Builder JSON, Live TV, advertisements, profiles, alerts, or another table. `stories.featured_media_id` is therefore the only current authoritative usage relationship.

## Direct and indirect usage model

Direct usage is a Story row whose `featured_media_id` equals the media ID. This relationship alone blocks retirement.

Indirect Homepage Builder usage is explanatory, not a second usage record:

```text
Homepage section -> storyId/storyIds -> Story -> featured_media_id -> media
```

The usage service may annotate a directly referencing Story with current Hero Story or Hero Sidebar placements by reading persisted Homepage Builder configuration. Category and list blocks are dynamic collections; they must not be reported as durable per-media usages because membership changes without a stored media or Story reference.

No `media_usages` table is justified. Duplicating Story usage there would create synchronization and backfill obligations without adding authority. If a future consumer stores a canonical media UUID directly, that future milestone must reassess a heterogeneous usage table.

## Proposed database design

No new table or lifecycle column is required. One additive migration will eventually provide:

- `retire_media_asset(media_id uuid, expected_updated_at timestamptz)`
- `restore_media_asset(media_id uuid, expected_updated_at timestamptz)`
- a `BEFORE INSERT OR UPDATE OF featured_media_id` trigger on `stories`
- privilege hardening that revokes direct `DELETE` on `media` and direct authenticated updates to `deleted_at`/`deleted_by`

The RPCs will be `SECURITY DEFINER`, owned by the migration owner, use `SET search_path = public`, derive the actor from `auth.uid()` and role from signed `app_metadata`, and expose only `EXECUTE` to authenticated users. They must never accept an actor ID from the client.

No caller may permanently delete a media row. Existing metadata and replacement writes retain column-level update access to non-lifecycle columns.

## Lifecycle

```text
ACTIVE:  deleted_at IS NULL, deleted_by IS NULL
   |
   | retire only when Story usage count is zero
   v
RETIRED: deleted_at IS NOT NULL, deleted_by IS NOT NULL
   |
   | restore while the database row and Cloudinary object remain present
   v
ACTIVE
```

Retirement hides the asset from the normal library, picker, Story selection, and metadata mutation paths. It preserves the row, canonical UUID, provider public ID, secure URL, metadata, audit fields, and Cloudinary object. It does not detach Stories. Retirement is blocked if any Story references the asset, regardless of Story status.

Restoration clears `deleted_at` and `deleted_by`, updates `updated_at`/`updated_by`, and returns the same asset to active queries. Restoration is safe because Milestone 8 never deletes the Cloudinary object.

## Transaction and concurrency design

The Story trigger and retirement RPC use the media row as the shared lock:

- Story assignment locks the target media row `FOR KEY SHARE`, then rejects it if `deleted_at` is non-null or `media_type` is not `image`.
- Retirement locks the media row `FOR UPDATE`, verifies it is active and its `updated_at` matches the stale-client token, then checks for any Story reference and updates the lifecycle fields.

Expected race outcomes:

1. **Assignment versus retirement:** whichever locks first completes; the waiter rechecks authoritative state. Either the Story reference commits and retirement is blocked, or retirement commits and assignment is rejected.
2. **Publish versus retirement:** an already-referencing Story blocks retirement. Publishing does not detach or rewrite media. A concurrent featured-media change follows the same trigger lock.
3. **Two retirements:** row locking serializes them. One succeeds; the second receives an already-retired or conflict result.
4. **Cloudinary failure after retirement:** impossible in this milestone because retirement makes no provider call.
5. **Cloudinary success with failed finalization:** impossible for the same reason.
6. **Stale tab:** `expected_updated_at` mismatch returns conflict and makes no change.

The usage list shown before confirmation is advisory. The RPC repeats the Story existence check inside the transaction and is the authoritative decision.

## Permissions

| Capability | Writer | Editor | Admin |
|---|---:|---:|---:|
| View media usage in Media Library | No | Yes | Yes |
| Retire unused media | No | Yes | Yes |
| Restore retired media | No | Yes | Yes |
| Permanently delete media | No | No | No |
| Trigger provider cleanup | No | No | No |

This matches the existing Media Library management boundary. Server authorization and database RPC authorization both enforce the role.

## RLS and grants

No `media_usages` or cleanup policy is needed. The migration will:

- revoke authenticated `DELETE` on `public.media`;
- replace broad table-level `UPDATE` with column-level grants excluding `deleted_at` and `deleted_by`;
- retain active media read behavior already enforced by application queries and current public Story RLS;
- grant only editor/admin execution through role checks inside retirement/restore RPCs;
- keep writers unable to mutate shared media;
- ensure the Story trigger validates active canonical media even if a caller bypasses Server Actions.

The implementation must verify the exact effective grants in a disposable database because existing migrations grant broad authenticated table privileges.

## Repository and service boundaries

The Media repository will expose focused methods:

- load active or retired media by ID for lifecycle screens;
- list direct Story usages with Story title, status, locale, and admin route data;
- optionally resolve persisted Hero Story/Hero Sidebar annotations for those Story IDs;
- invoke the retirement and restoration RPCs;
- never expose a hard-delete method.

The service maps database errors into `NOT_FOUND`, `IN_USE`, `CONFLICT`, `ALREADY_RETIRED`, and `FORBIDDEN` outcomes. It does not call Cloudinary during either lifecycle operation.

## UI design

The preview dialog gains a “Usage and lifecycle” section:

- active unused asset: “Not currently used by a Story” and a Retire action;
- active used asset: “Used by N Stories,” linked Story titles/status/locales, optional indirect Hero placement annotations, and a disabled retirement explanation;
- retired asset: visible only through an explicit Retired filter/view, with retirement actor/time and Restore;
- internal UUIDs and provider errors are never displayed.

Confirmation names the asset, states that retirement hides it from selection, and makes no deletion claim. If the RPC reports new usage or a conflict, the dialog remains open, announces the error, and refreshes usage/state. Focus returns to the invoking control when dialogs close.

## Cache and revalidation

Successful retirement or restoration revalidates:

- `/admin/media` for active/retired lists;
- `/admin/stories` and Story edit routes so selection state is current;
- `/en`, `/hi`, and `/mr` defensively.

Referenced media cannot retire, so public Story and Homepage Builder rendering cannot be broken by lifecycle mutation. Preview remains persisted and manually refreshed. No new cache mechanism is introduced.

## Backfill and migration safety

No usage backfill is needed. Usage queries read existing `stories.featured_media_id` directly. Existing Story IDs, media UUIDs, provider IDs, secure URLs, metadata, and relationships remain unchanged.

The migration is additive except for privilege hardening and removal of the obsolete hard-delete capability. It creates functions/trigger and adjusts grants; it does not add/drop tables or columns. Rollback may drop the functions/trigger and restore prior grants, but must not alter data. Retired rows remain valid if application rollback occurs, although older code must not be redeployed while it still exposes hard delete.

## Test strategy

Database tests must cover active assignment, retired assignment rejection, direct Story usage, no usage, multiple Stories, concurrent assignment/retirement in both lock orders, simultaneous retirement, stale tokens, role enforcement, direct lifecycle update denial, and direct delete denial.

Repository/service tests must cover usage details, optional Hero annotations, unused/used/retired/not-found states, retirement, restoration, conflicts, sanitized errors, and absence of Cloudinary calls.

UI contracts must cover used and unused copy, linked Story details, disabled retire action, confirmation, retired filter, restore, live announcements, keyboard operation, focus restoration, and stale/conflict recovery.

Regression tests must prove Stories, Story Reader, Media Picker, Homepage Builder Hero Story/Hero Sidebar, category/list blocks, preview, and public homepage behavior remain unchanged; active queries exclude retired rows and restored rows return.

## Rollout and rollback

1. Apply the database trigger/RPC/grant migration first.
2. Verify role and concurrency SQL against a disposable environment.
3. Deploy repository/service actions with hard deletion removed.
4. Deploy usage and lifecycle UI.
5. Run all Story/Homepage/public regressions in all locales.

Rollback application and migration only as a coordinated operation. Never restore direct hard-delete UI without an explicit new design.

## Approved decisions and non-goals

- Retirement plus restoration only.
- Story FK is the sole authoritative current usage.
- No `media_usages`, backfill, permanent deletion, provider destroy, retention window, cleanup status, outbox, retry worker, Homepage Builder mutation, Live TV integration, or new dependency.
