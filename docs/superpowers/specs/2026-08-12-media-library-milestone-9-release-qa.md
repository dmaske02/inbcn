# Media Library Milestone 9 Release QA

## Scope and frozen architecture

This is a stabilization and release-QA pass over Media Library Phase 5 Milestones 1–8. It adds no product functionality. `public.media` remains the canonical asset table; `stories.featured_media_id` is the only authoritative usage relationship; Homepage Builder resolves media indirectly through Stories; Live TV continues to use external poster URLs. The lifecycle remains reversible `ACTIVE ↔ RETIRED`, with no database deletion, Cloudinary deletion, retention window, cleanup queue, or `media_usages` table.

## Automated verification scope

The automated suite covers schema compatibility, RLS/grant contracts, guarded retirement and restore RPCs, Story featured-media validation, upload byte and filename validation, server-controlled Cloudinary identifiers, repository pagination and filtering, picker behavior, metadata conflicts, lifecycle conflicts, Story integration, Homepage Builder compatibility, public rendering, accessibility source contracts, cache invalidation boundaries, TypeScript, ESLint, and production compilation.

Security review additionally verifies that Server Actions authenticate and derive identity server-side, editor/admin authorization is repeated in services and lifecycle RPCs, lifecycle fields cannot be directly updated by authenticated clients, media rows cannot be directly deleted, provider credentials remain server-only, and client-facing view models do not serialize Cloudinary public IDs or retirement actor UUIDs.

## Manual Media Library checklist

Each item below remains **MANUAL** until completed in an authenticated browser session against a disposable or approved non-production environment.

- [ ] **MANUAL** Open `/admin/media` as editor and admin; confirm writer and unauthenticated denial.
- [ ] **MANUAL** Verify the empty state with no active assets.
- [ ] **MANUAL** Verify the loading skeleton and announcement.
- [ ] **MANUAL** Force a safe request failure and verify the error state and retry.
- [ ] **MANUAL** Search by title, filename, credit, alt text, and caption.
- [ ] **MANUAL** Verify punctuation and repeated-space search normalization.
- [ ] **MANUAL** Apply media-type filtering.
- [ ] **MANUAL** Apply 7-day and 30-day date filters.
- [ ] **MANUAL** Navigate Previous/Next pagination and preserve filters.
- [ ] **MANUAL** Open and close the preview dialog.
- [ ] **MANUAL** Open preview by keyboard, press Escape, and verify focus returns.
- [ ] **MANUAL** Enter metadata editing mode.
- [ ] **MANUAL** Trigger required/length validation and inspect field errors.
- [ ] **MANUAL** Save metadata and verify the refreshed value.
- [ ] **MANUAL** Simulate a stale editor tab and verify the conflict message.
- [ ] **MANUAL** Cancel dirty changes and verify the discard confirmation.
- [ ] **MANUAL** Upload valid JPEG, PNG, WebP, and AVIF images.
- [ ] **MANUAL** Verify upload success and refreshed active library.
- [ ] **MANUAL** Verify invalid, oversized, spoofed, malformed, and provider-failed uploads show sanitized errors.
- [ ] **MANUAL** Retry after a recoverable upload or loading failure.
- [ ] **MANUAL** Verify active assets appear in the default view.
- [ ] **MANUAL** Verify retired assets are absent from the active view.
- [ ] **MANUAL** Select the Retired filter and inspect retired state/time.
- [ ] **MANUAL** Confirm retirement messaging says selection is hidden and records/files are preserved.
- [ ] **MANUAL** Verify referenced media retirement is blocked without detaching Stories.
- [ ] **MANUAL** Verify usage rows show Story title, status, locale, and working admin link.
- [ ] **MANUAL** Restore retired media and verify the same asset returns to Active.
- [ ] **MANUAL** Open Media Picker, search/filter/page, select, cancel, and confirm.
- [ ] **MANUAL** Verify retired media never appears in Media Picker.

## Story, Homepage Builder, and public regression checklist

- [ ] **MANUAL** Create Story → choose media → save → reload; selection persists.
- [ ] **MANUAL** Edit Story → replace media → save → reload; replacement persists.
- [ ] **MANUAL** Edit Story → remove media → save → reload; reference is null.
- [ ] **MANUAL** Confirm forged and retired media UUIDs are rejected server-side and client metadata is not trusted.
- [ ] **MANUAL** Verify Story detail/cards and English, Hindi, and Marathi category/home pages render canonical, external, and missing-image fallbacks.
- [ ] **MANUAL** Verify Homepage Builder Hero Story, 1–3 Hero Sidebar stories, 70/30 desktop layout, responsive stacking, category/list blocks, preview refresh, autosave, drag-and-drop, writer read-only state, and locale isolation remain unchanged.
- [ ] **MANUAL** Confirm preview uses persisted configuration and never serializes unsaved editor state.

## Responsive checklist

At **320, 375, 390, 768, 1024, 1280, and 1440 px**, verify **MANUAL**: no horizontal overflow; toolbar wrapping; grid density; preview sizing/scrolling; metadata editor; usage list; lifecycle controls; pagination; upload form; error messages; and Story editor picker integration. At 200% zoom verify no critical clipping, overlap, or unusable controls.

## Accessibility checklist

Verify **MANUAL** keyboard-only navigation through toolbar, search, filters, pagination, preview, metadata form, picker, retire, restore, and dialog dismissal. Confirm visible focus, accessible names, labels/descriptions, `aria-invalid`, `aria-live` announcements, Escape behavior, focus restoration, and no keyboard traps. With a screen reader, verify loading, upload/save/lifecycle success, failure, conflict, and in-use announcements.

## Browser checklist

Verify **MANUAL** in Chromium/Chrome, Firefox, and WebKit/Safari-equivalent: dialogs, file inputs, optimized images, keyboard navigation, focus restoration, responsive wrapping/sticky behavior, and Server Action errors. No cross-browser pass is recorded without executing these checks.

## Performance and cache checks

**AUTOMATED/STATIC:** Library and picker queries use bounded server pagination; picker responses do not accumulate all pages; grid cards use bounded Cloudinary thumbnails and responsive `sizes`; full delivery images render only in preview content; server-only modules protect database/provider access; interactive code is isolated to focused client components. Successful upload/replacement and lifecycle mutations invalidate their documented routes, metadata updates invalidate `/admin/media`, and failure branches return before revalidation. Homepage preview refresh remains independent.

## Database verification

The project-local Supabase CLI (`2.111.0`) is installed, but disposable runtime verification is unavailable because neither Docker nor Podman is installed or on `PATH`; `supabase status` reports that it cannot inspect container health. The repository also has no local `supabase/config.toml`. No linked or production database was accessed. Therefore migrations, grants, RLS, trigger behavior, lifecycle transitions, stale writes, and lock-order races are verified only by static contracts and the disposable verification SQL remains unexecuted.

## Known limitations and release recommendation

- Authenticated manual browser QA is pending because no authenticated non-production session was available during this pass.
- Responsive, screen-reader, 200% zoom, and cross-browser walkthroughs are pending manual execution.
- Runtime PostgreSQL/Supabase migration and concurrency verification is pending a disposable Docker/Podman-backed environment.

Provided the full automated verification remains green and no production defect is found, the appropriate classification is **READY WITH DOCUMENTED QA LIMITATIONS**, not `READY FOR RELEASE`, until the pending runtime and manual checks are completed.
