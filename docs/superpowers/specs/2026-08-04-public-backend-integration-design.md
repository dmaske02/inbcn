# INBCN Public Backend Integration Design

**Date:** 2026-08-04  
**Status:** Approved requirements recorded  
**Scope:** Replace hardcoded public news content with the existing backend while preserving the approved UI exactly.

## Constraints

- Do not modify CSS, spacing, typography, colors, borders, animations, responsive behavior, layout, or component hierarchy.
- Use the existing Supabase repositories, server-side services, and view models.
- Do not add a second backend, duplicate repository logic, or add public API routes unless the existing server-side path cannot satisfy a requirement.
- Never render demo stories, fixtures, empty cards, placeholder frames, fake timestamps, or duplicated stories.

## Data Architecture

getHomepageData(locale) remains the single server-side entry point for homepage data. It queries published stories, categories, and active managed alerts through existing repositories and composes one consistent view-model snapshot:

- featured
- breaking
- pinnedAlert
- topHeadlines
- latest
- trending
- categoryRails
- editorPicks

The homepage presentation consumes only this view model. It contains no story arrays or fallback editorial text.

Category pages continue through getCategoryPageData(). Story pages continue through getStoryReaderData(). These services already query published backend records and are not replaced.

## Selection and Visibility

All public stories must have status = published and a non-null published_at.

1. Featured: newest story with is_featured = true, ordered by published_at descending. Hide the featured section if none exists.
2. Breaking: stories with is_breaking = true, ordered by published_at descending. Hide the ticker if none exist.
3. Pinned alert: newest applicable active managed alert returned by the existing alert service. Hide the pinned alert when none exists.
4. Top Headlines: published backend stories assigned after Featured and Breaking exclusions.
5. Trending: use existing trending logic. The current project strategy is newest published stories, so retain that strategy while excluding higher-priority assignments. Hide when empty.
6. Category Rails: use active categories and only stories whose category_id matches. Hide a rail with zero remaining stories.
7. Latest: published stories ordered by published_at descending, excluding stories already assigned above. Show when non-empty.
8. Editor Picks: published featured candidates remaining after higher-priority assignments. Hide when empty.

Deduplication priority is Featured, Breaking, Top Headlines, Trending, Category Rails, Latest. A story assigned to a higher-priority collection is excluded from lower-priority collections.

## Publishing Flow and Freshness

Admin story commands remain authoritative. Creating or saving a story persists through the existing story service and repository. Publishing sets the published status and timestamp. Editorial flags persist through the existing Featured and Breaking fields.

Story creation, publication, update, unpublication, category changes, Featured/Breaking changes, and alert activation/deactivation must invalidate the affected public routes through the existing Next.js revalidation mechanism. The next public render queries current backend state, so no source edit or static JSON update is required.

## Error Handling

Repository or service failures must not cause demo content to appear. Optional homepage sections are omitted when their data is unavailable. The approved masthead, navigation, page shell, and footer remain intact. Existing not-found behavior remains for missing story and category records.

## Testing

Tests must prove:

- published records are selected and ordered correctly;
- drafts and unpublished records never appear;
- Featured, Breaking, alerts, categories, Trending, Latest, and Editor Picks obey visibility rules;
- homepage collections contain no duplicated story IDs;
- category queries remain category-scoped;
- story pages load the backend record and related backend stories by slug;
- admin mutations revalidate affected public paths;
- presentation files contain no hardcoded editorial arrays or demo stories;
- approved UI classes and markup remain unchanged.

## Out of Scope

- Visual redesign or styling changes.
- New analytics-based Trending algorithm.
- New public API endpoints.
- Database schema changes unless an existing requirement cannot be represented by the current story and alert schemas.
