# INBCN public application layout

The public shell implements the approved Signal Edition hierarchy for every
localized reader route. It provides framing and interaction only; it does not
fetch stories, define page content, or introduce business logic.

## Layout hierarchy

```text
PublicLayout
├── SkipToContent
├── UtilityBar
├── Header
│   ├── Logo
│   ├── PrimaryNavigation
│   ├── SearchTrigger
│   ├── LanguageSwitcher
│   ├── ThemeToggle
│   └── MobileNavigation
├── SignalRail slot
├── main#main-content
│   └── Page content
├── Advertisement slot
└── Footer
    └── FooterNavigation
```

`src/app/[locale]/layout.tsx` validates the locale, establishes the
`next-intl` request locale, and wraps all localized routes in `PublicLayout`.
Admin routes remain outside this route group and are unaffected.

The signal rail is an optional slot. Pages or future editorial state may supply
Breaking, Live, Verified, Corrected, or Developing content; the shell does not
display an empty rail. Advertisement and breadcrumb wrappers are exported for
consistent placement by future pages without adding ads or page-specific
navigation to the shell today.

## Component responsibilities

- `PublicLayout` owns the single public `main` landmark and assembles localized
  navigation, utility information, footer links, and overridable shell slots.
- `UtilityBar` presents the localized date plus non-functional weather, market,
  and live placeholders.
- `Header` owns sticky and scroll-compressed presentation. It changes from a
  64 px to a 56 px minimum height after 24 px of scroll.
- `PrimaryNavigation` exposes the highest-priority editorial sections on large
  screens.
- `MobileNavigation` exposes the complete section set below the header and owns
  open/close focus behavior.
- `LanguageSwitcher` preserves the current path while replacing only its locale
  segment.
- `SearchTrigger` is intentionally a non-functional, accessible placeholder.
- `ThemeToggle` changes and persists the document theme in local storage.
- `SignalRail` adapts the design-system editorial signal to the compressed
  sticky-header offset.
- `Footer` and `FooterNavigation` provide localized discovery and trust links.
- `PublicAdvertisement`, `BreadcrumbPlaceholder`, and the shell slots reserve
  stable integration points for later page milestones.

## Responsive behavior

- **Desktop and laptop (`lg` and above):** the primary section navigation,
  search, language switcher, and theme control share the sticky header.
- **Tablet:** primary links collapse into the menu; search and language remain
  directly available.
- **Mobile:** the compact logo and actions remain visible. The menu opens below
  the header, uses a single-column link list on small phones, and becomes a
  two-column list where space permits. Weather and market placeholders
  progressively hide while date and live status remain.
- Logical margin and border utilities are used so components remain compatible
  with future right-to-left locales even though Phase 1 supports `en`, `hi`,
  and `mr`.

## Accessibility decisions

- A keyboard-visible skip link moves focus to `main#main-content`.
- The shell uses semantic `header`, `nav`, `main`, and `footer` landmarks with
  localized accessible labels.
- The mobile trigger exposes `aria-expanded` and `aria-controls`; opening moves
  focus to the first link, Escape closes the panel and restores trigger focus,
  and pointer interaction outside the panel closes it.
- Controls inherit the design system's 44 px minimum touch target and visible
  focus treatment.
- Decorative icons are hidden from assistive technology; button intent is
  provided through localized labels.
- Header motion is brief and disabled when reduced motion is requested.
- Color, dark mode, and focus styling use shared semantic tokens rather than
  page-specific values.
