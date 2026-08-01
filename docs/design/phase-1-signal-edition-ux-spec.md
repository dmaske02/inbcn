# INBCN Phase 1 — Signal Edition UX Specification

**Status:** Approved design direction
**Scope:** Public homepage foundation
**Locales:** English (`en`), Hindi (`hi`), Marathi (`mr`)
**Design milestone:** Phase 1, pre-implementation
**Intended audience:** Product design, frontend engineering, editorial, SEO,
accessibility, advertising, and QA

---

## 1. Product position

INBCN is a multilingual Indian newsroom product. It is not a blog, lifestyle
magazine, social feed, or infinite content stream. Its interface must help
readers answer four questions quickly:

1. What is most important now?
2. What changed recently?
3. Why should I trust this information?
4. Where can I go deeper?

The approved visual direction is **Signal Edition**: a typography-led,
high-trust editorial system with one distinctive element—the **Editorial Signal
Rail**. The rail communicates newsroom state such as Breaking, Live, Verified,
Corrected, and Developing. All other visual language remains quiet so that the
signal retains meaning.

### Experience principles

1. **Editorial priority over algorithmic popularity.** The lead story and
   section order are editorial decisions.
2. **Provenance is visible.** Source, author, update time, and correction state
   are never hidden behind interaction.
3. **One clear reading path.** Each viewport presents one dominant next step.
4. **Multilingual parity.** English, Hindi, and Marathi receive equal hierarchy,
   not translated leftovers.
5. **Fast by construction.** Stable dimensions, restrained imagery, pagination,
   and server-rendered content are part of the design.
6. **Urgency is scarce.** Red, motion, and alert language are reserved for
   meaningful editorial states.

---

## 2. Final visual direction

### Signature

The Editorial Signal Rail is a thin horizontal band immediately below the
primary navigation. A 4 px signal marker, state label, concise headline, time,
and optional action create a recognizable INBCN pattern.

The rail is not a ticker. It does not auto-scroll, rotate, marquee, or show
multiple competing stories. It communicates one highest-priority newsroom
state at a time.

### Visual character

- Calm, near-white editorial canvas
- Dark ink typography rather than pure black
- Fine structural rules instead of card chrome
- Restrained serif headlines paired with highly legible sans-serif UI and body
- Vermilion signal color used only for editorial urgency and critical focus
- Minimal radius and almost no elevation in the content canvas
- Generous section rhythm inspired by premium product interfaces
- Dense enough for fast news scanning, spacious enough for sustained reading

---

## 3. Design tokens

### 3.1 Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#FCFCFA` | `#101214` | Page background |
| Surface | `#FFFFFF` | `#171A1D` | Menus, overlays, elevated controls |
| Ink | `#15171A` | `#F3F4F2` | Primary text |
| Secondary ink | `#59616B` | `#ABB2BA` | Metadata and supporting copy |
| Rule | `#D9DDE1` | `#343A40` | Dividers and boundaries |
| Soft surface | `#F1F3F4` | `#202429` | Skeletons, selected-neutral surfaces |
| Signal | `#C51F2B` | `#FF6B73` | Breaking/live/corrected state and focus accent |
| Link | `#1559B7` | `#7DB3FF` | Inline links and navigational emphasis |
| Success | `#16784A` | `#5DD39E` | Verified state when distinction is required |

Rules:

- Body text must meet WCAG 2.2 AA contrast; essential UI targets AAA where
  practical.
- Signal color never identifies a state by color alone. Every state includes a
  text label and, where needed, an icon.
- Category identity uses labels and typography, not a rainbow palette.
- Large areas never use Signal as a background except a short critical alert.

### 3.2 Typography

Use optical size and script-specific fallbacks so all locales retain equivalent
authority.

| Role | Latin | Devanagari | Weight |
| --- | --- | --- | --- |
| Display/headline | Source Serif 4 | Noto Serif Devanagari | 600–700 |
| Body/UI | Inter | Noto Sans Devanagari | 400–600 |
| Data/time | Inter, tabular figures | Noto Sans Devanagari | 500 |

#### Type scale

| Token | Desktop | Mobile | Line height | Use |
| --- | --- | --- | --- | --- |
| Display XL | 56 px | 38 px | 1.04–1.10 | Exceptional homepage lead |
| Display L | 44 px | 32 px | 1.08–1.14 | Standard homepage hero |
| Heading 1 | 36 px | 30 px | 1.12–1.20 | Page and section lead |
| Heading 2 | 28 px | 24 px | 1.18–1.25 | Section feature |
| Heading 3 | 22 px | 20 px | 1.22–1.30 | Standard story card |
| Heading 4 | 18 px | 18 px | 1.28–1.35 | Compact/list story |
| Body L | 19 px | 18 px | 1.60–1.72 | Article body |
| Body | 16 px | 16 px | 1.50–1.62 | Summaries and interface copy |
| Meta | 14 px | 14 px | 1.40–1.50 | Source, time, author |
| Caption | 13 px | 13 px | 1.40–1.50 | Images, ads, legal |

Headline sizes are fluid between breakpoints. Hindi and Marathi headlines may
need one additional line; containers must be height-flexible. Never reduce
Devanagari below the equivalent Latin size to force matching heights.

### 3.3 Spacing

Base unit: 4 px.

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

- Inline icon/text gap: 8 px
- Compact component inset: 12 px
- Standard component inset: 16–24 px
- Card gap: 20–24 px
- Section gap: 64 px desktop, 48 px tablet, 40 px mobile
- Page edge: 24–32 px desktop, 20–24 px tablet, 16 px mobile
- Headline-to-summary: 12–16 px
- Summary-to-metadata: 12 px

### 3.4 Grid

| Viewport | Columns | Gutter | Outer margin |
| --- | --- | --- | --- |
| ≥1440 px | 12 | 24 px | auto, max canvas 1280 px |
| 1200–1439 px | 12 | 24 px | 32 px |
| 1024–1199 px | 12 | 20 px | 24 px |
| 768–1023 px | 8 | 20 px | 24 px |
| 480–767 px | 4 | 16 px | 16 px |
| 320–479 px | 4 | 12 px | 16 px |

Article reading measure: **60–68 characters**, maximum approximately 720 px.

### 3.5 Shape, elevation, and iconography

- Editorial cards: 0–2 px radius
- Controls and menus: 4–6 px radius
- Pills: reserved for filters, language options, or temporary status
- Content surfaces: no shadow
- Sticky header: 1 px rule; subtle shadow only after content scrolls beneath it
- Menus/dialogs: one restrained elevation level
- Icons: Lucide, normally 18–20 px, 1.5–2 px optical weight
- Essential icon actions require a visible label or accessible name

### 3.6 Motion

- Control feedback: 120–160 ms
- Menu and disclosure transitions: 160–200 ms
- No page-load reveal sequence
- No parallax
- No card lift
- Signal update: one 600 ms background emphasis, then static
- No looping pulse except a tiny Live status dot, and that dot becomes static
  under reduced-motion preferences

---

## 4. Global shell

### 4.1 Utility bar

A 32 px desktop / 36 px touch-height strip sits above the primary header.

**Left cluster**

- Current date in localized format
- City/weather placeholder

**Right cluster**

- Market placeholder
- Live status

Example:

`Thursday, 30 July · New Delhi 31°`
`SENSEX +0.4% · LIVE`

Behavior:

- Desktop and laptop show all four items.
- Tablet shows date and Live; weather and market move to an overflow disclosure.
- Mobile shows localized short date and Live only.
- Values are plain text, not dense widgets.
- Market color is paired with plus/minus symbols.
- Weather and market remain non-interactive placeholders in Phase 1.

### 4.2 Primary header

Height: 64 px desktop, 60 px mobile. Sticky after the utility bar scrolls away.

Order:

1. INBCN logo/home link
2. Top category navigation
3. Search
4. Language switcher
5. Theme toggle
6. Future profile placeholder

Desktop navigation exposes:

`Latest, National, World, Politics, Business, Technology, Sports`

Entertainment and Opinion remain discoverable through the secondary category
menu and homepage sections. This prevents an overloaded header.

Responsive behavior:

- Laptop: category labels tighten; lower-priority categories move to “More”.
- Tablet: logo, Search, Language, and Menu remain visible.
- Mobile: Menu, centered/left logo, Search, and Language remain; theme lives
  inside the menu if width is constrained.
- Future profile occupies a reserved 40 px control position but is not rendered
  in Phase 1.

Sticky behavior:

- Utility bar is not sticky.
- Primary header becomes sticky at the top.
- Header height never shrinks during scroll.
- The rail stays directly beneath the sticky header only while its state is
  Breaking, Live, or Corrected. Verified and Developing rails scroll normally.

### 4.3 Editorial Signal Rail

#### Anatomy

```text
┌─ 4 px state marker ───────────────────────────────────────────────────┐
│ [STATE]  Concise verified headline                    10:42  [Open →] │
└───────────────────────────────────────────────────────────────────────┘
```

| State | Meaning | Treatment | Persistence |
| --- | --- | --- | --- |
| Breaking | High-impact confirmed event | Signal marker + label | Sticky until downgraded |
| Live | Active event with rolling coverage | Signal marker + optional static dot | Sticky |
| Verified | High-interest claim independently confirmed | Success marker + label | Scrolls normally |
| Corrected | Material correction to published information | Signal marker + correction label | Sticky for session |
| Developing | Confirmed event with incomplete details | Neutral/signal marker + label | Scrolls normally |

Rules:

- One rail item at a time.
- Maximum headline length: 110 characters desktop, 72 mobile before concise
  editorial rewrite—not truncation.
- No auto-rotation.
- No horizontal marquee.
- State label remains visible on every viewport.
- Timestamp uses absolute time for Live and relative time elsewhere.
- Clicking anywhere on the headline region opens the associated story.
- Screen readers announce new rail content only when the update is materially
  important; routine timestamp changes are not live announcements.
- Corrected state links directly to the correction note.
- If no active signal exists, the rail is absent; the layout closes the space
  without an empty placeholder.

---

## 5. Final homepage blueprint

### 5.1 Desktop annotated layout

```text
┌──────────────────────────── Utility bar ──────────────────────────────┐
│ Date · Weather                                  Market · Live status │
├──────────────────────────── Header ───────────────────────────────────┤
│ INBCN   Latest National World Politics Business Tech Sports  ⌕ EN ◐ │
├──────────────────────── Editorial Signal Rail ────────────────────────┤
│ BREAKING  One concise verified update                         Open → │
├──────────────────────────── Canvas ───────────────────────────────────┤
│                                                                      │
│  HERO FEATURE — 8 columns                       LATEST — 4 columns    │
│  Category · headline                            10:42 Headline       │
│  summary · metadata                             10:18 Headline       │
│  balanced image                                 09:56 Headline       │
│                                                 View all latest →    │
│  ┌──────── Secondary A ────────┐ ┌── Secondary B ────────────────┐   │
│  └─────────────────────────────┘ └────────────────────────────────┘   │
│                                                                      │
│  NATIONAL — lead + 3 cards                       TRENDING rail        │
│  ──────────────────────────────────────────────────────────────────  │
│  WORLD — lead + 3 cards                          AD 300 × 250         │
│  ──────────────────────────────────────────────────────────────────  │
│  AD — leaderboard / responsive                                      │
│  ──────────────────────────────────────────────────────────────────  │
│  TECHNOLOGY — 3 cards        BUSINESS — 3 cards                     │
│  ──────────────────────────────────────────────────────────────────  │
│  SPORTS — visual rail                                                │
│  ──────────────────────────────────────────────────────────────────  │
│  ENTERTAINMENT — visual rail                                         │
│  ──────────────────────────────────────────────────────────────────  │
│  OPINION — author-led, low imagery                                   │
│  ──────────────────────────────────────────────────────────────────  │
│  EDITOR'S PICKS — curated, evergreen context                         │
│  ──────────────────────────────────────────────────────────────────  │
│  AD — footer leaderboard                                             │
├──────────────────────────── Footer ───────────────────────────────────┤
│ Explore · Categories · Languages · About · Trust · Legal · Contact  │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Hero and opening screen

The first viewport must contain:

- Global navigation
- Active signal, if present
- A single dominant featured story
- At least two visible Latest headlines

Desktop hero:

- 8-column editorial feature
- 4-column Latest panel
- Feature uses a 5:4 or 16:10 image, never a panoramic takeover
- Headline and image receive roughly equal visual weight
- Two secondary stories form a 2-column row below the hero feature

Laptop:

- 7-column feature / 5-column Latest
- Secondary stories remain side by side

Tablet:

- Hero feature becomes image-first or text-first according to editorial asset
  quality
- Latest becomes a full-width horizontal list immediately below
- Secondary stories become a two-column row

Mobile:

- Lead headline precedes image in DOM and visual order
- Summary is limited editorially to two concise sentences
- Secondary stories become horizontal cards
- Latest shows four items and a “View all latest” link

### 5.3 Complete reading order

1. **Signal Rail** — tells the reader what changed now.
2. **Featured Story** — establishes the day’s editorial priority.
3. **Latest News** — serves repeat and urgency-driven visitors.
4. **National** — broadest shared relevance for the primary audience.
5. **World** — global context after immediate domestic relevance.
6. **Technology** — high-frequency, high-interest explanatory coverage.
7. **Business** — markets, policy, economy, and consumer impact.
8. **Sports** — naturally visual and time-sensitive.
9. **Entertainment** — high-interest but placed after civic and economic news.
10. **Opinion** — clearly separated from reporting to preserve trust.
11. **Editor’s Picks** — curated depth and evergreen value.
12. **Trending** — supplementary discovery, never the editorial lead.
13. **Footer** — trust, navigation, language, and institutional information.

Why this order works:

- It moves from urgency to significance, then from broad public relevance to
  interest-based discovery.
- Latest appears early for returning readers without displacing the curated
  lead.
- Opinion is visually and structurally separated from reporting.
- Trending is a secondary rail on large screens and a late section on mobile,
  preventing popularity from overriding editorial judgment.
- The order creates predictable section URLs and heading hierarchy for SEO.

### 5.4 Section patterns

| Section | Desktop | Mobile | Editorial purpose |
| --- | --- | --- | --- |
| National | One lead + three standard cards | Lead + compact list | Highest shared relevance |
| World | One horizontal lead + three compact cards | Horizontal list | Global context |
| Technology | Three equal standard cards | Horizontal cards | Scannable topic breadth |
| Business | One feature + latest list | Compact list | Data-heavy clarity |
| Sports | Visual three-card rail | Vertical image cards | Event-driven browsing |
| Entertainment | Visual three-card rail | Vertical image cards | Controlled visual energy |
| Opinion | Author avatar/name + text cards | Text list | Clear content-type distinction |
| Editor’s Picks | Two wide evergreen cards | Stacked cards | Depth and retention |
| Trending | Ranked sidebar list | Late numbered list | Discovery, not authority |

---

## 6. Story card system

Every card is a link group with a single primary story destination. Cards expose
only the metadata needed for their context.

### 6.1 Hero card

**Use:** One homepage lead only.
**Contains:** category, headline, summary, image, publish/update time, optional
signal badge.
**Layout:** text/image split desktop; stacked mobile.
**Rule:** no competing buttons. The headline is the primary link.

### 6.2 Featured card

**Use:** Section lead, Editor’s Picks, major secondary homepage story.
**Contains:** image, category, headline, short summary, time.
**Layout:** vertical or horizontal according to section grid.
**Rule:** maximum two Featured cards in one viewport.

### 6.3 Standard card

**Use:** Three-column category rails.
**Contains:** 16:9 image, category, headline, time; summary optional.
**Layout:** vertical.
**Rule:** headline should normally remain within three lines; containers may
grow for Devanagari.

### 6.4 Compact card

**Use:** Sidebar, related stories, dense category continuation.
**Contains:** headline, category/time, optional small image.
**Layout:** text-first.
**Rule:** image is removed rather than reduced below a useful size.

### 6.5 Horizontal card

**Use:** Mobile secondary story, World lead, search/category results.
**Contains:** headline and metadata left, 4:3 thumbnail right.
**Layout:** 65/35 text/image split.
**Rule:** DOM order remains headline then image.

### 6.6 List item

**Use:** Latest News, Trending, Business updates.
**Contains:** time or rank, headline, optional source/category.
**Layout:** no card surface; separated by rules.
**Rule:** Trending rank never implies editorial quality.

---

## 7. Advertising strategy

Ads must be predictable, labeled, dimensionally stable, and visually separate
from editorial cards.

### 7.1 Desktop placements

1. **Below World:** responsive leaderboard after two substantive sections.
2. **Trending sidebar:** 300 × 250 or 300 × 600 after at least three trending
   items.
3. **Between Business and Sports:** optional responsive leaderboard.
4. **Before footer:** low-priority leaderboard.

### 7.2 Tablet placements

- Sidebar ads move into the main flow after a completed section.
- No ad splits a section heading from its lead story.
- Minimum two editorial modules between full-width ad slots.

### 7.3 Mobile placements

1. After Latest, only if the lead and at least four latest items were shown.
2. Between World and Technology.
3. Between Entertainment and Opinion.
4. Before footer.

### 7.4 Rules

- Label every slot “Advertisement”.
- Reserve the final slot height before loading to prevent layout shift.
- Never place an ad inside the hero group.
- Never insert an ad between headline, summary, and metadata.
- No sticky mobile ad in Phase 1.
- No autoplay video ad.
- Empty slots collapse completely after a bounded load decision.
- Ad styling must never imitate story cards or editorial labels.

---

## 8. Responsive specification

### Desktop ≥1200 px

- Full utility bar and category navigation
- 12-column grid
- Hero/Latest split
- Trending and one ad occupy the right rail
- Three-column category cards
- Maximum canvas 1280 px

### Laptop 1024–1199 px

- Full shell with reduced navigation
- 12-column grid with 20 px gutters
- Hero uses 7 columns; Latest uses 5
- Trending rail narrows; summaries reduce before headline sizes do

### Tablet 768–1023 px

- 8-column grid
- Compact primary header
- Hero and Latest stack
- Two-column card grids
- Sidebar content moves after its associated main section
- Ad units become full-width responsive blocks

### Large mobile 480–767 px

- 4-column grid
- Single content column with selective two-up chips only
- Lead text precedes image
- Horizontal cards for secondary stories
- Latest and Trending become ruled lists
- Category navigation becomes an accessible menu

### Small mobile 320–479 px

- 16 px outer margins and 12 px internal gaps
- Date uses abbreviated localized form
- Theme control moves into menu if required
- Signal rail becomes two rows: state/time, then headline
- Card images are full-width or omitted
- Metadata is reduced by priority, never below 13 px
- No horizontally clipped navigation or content

### Collapse order

```text
Desktop: Hero + Latest rail → Secondary pair → Section grid + Trending rail
Tablet:  Hero              → Latest list  → Secondary pair → 2-column grids
Mobile:  Hero              → Latest list  → Secondary stack → 1-column sections
```

Content order in the DOM matches the mobile reading order. Desktop layouts use
grid placement without reordering semantic content.

---

## 9. Component hierarchy

```text
PublicShell
├── UtilityBar
│   ├── LocalizedDate
│   ├── WeatherPlaceholder
│   ├── MarketPlaceholder
│   └── LiveStatus
├── PrimaryHeader
│   ├── Brand
│   ├── PrimaryNavigation
│   ├── SearchTrigger
│   ├── LanguageSwitcher
│   ├── ThemeToggle
│   └── ProfileSlot (reserved, not rendered)
├── EditorialSignalRail
├── Main
│   ├── HeroGroup
│   │   ├── HeroStory
│   │   ├── SecondaryStory × 2
│   │   └── LatestPanel
│   ├── NewsSection: National
│   ├── NewsSection: World
│   ├── AdSlot
│   ├── PairedSections
│   │   ├── NewsSection: Technology
│   │   └── NewsSection: Business
│   ├── NewsSection: Sports
│   ├── NewsSection: Entertainment
│   ├── OpinionSection
│   ├── EditorsPicks
│   ├── TrendingSection
│   └── AdSlot
└── Footer
    ├── ExploreLinks
    ├── CategoryLinks
    ├── LanguageLinks
    ├── TrustAndLegalLinks
    ├── ContactAndSocial
    └── Copyright
```

### Shared structural primitives

- Container
- Section
- SectionHeader
- ResponsiveGrid
- StoryCard variants
- StoryMeta
- CategoryLabel
- Timestamp
- AdSlot
- Skeleton variants
- EmptyState
- ErrorState

Components receive content priority and variant explicitly. They do not infer
editorial importance from list position.

---

## 10. Loading, empty, and error behavior

### Skeletons

- Match the final component’s exact geometry.
- Reserve media aspect ratio and ad height.
- Use a static soft fill by default.
- If shimmer is used, it stops under reduced motion.
- Do not skeletonize persistent shell content.
- Server-rendered headline text should appear without waiting for optional
  images or client data.

### Empty states

- Section empty: omit the section entirely on the homepage.
- Latest empty: show “Latest updates are temporarily unavailable” with a Retry
  action.
- Search/category empty: explain the active filter and offer a clear reset.
- Never show decorative illustrations that imply success or failure vaguely.

### Errors

- Preserve header, signal rail, and footer.
- Identify what failed: “Latest stories could not be loaded.”
- Offer one Retry action.
- Do not expose database, network, or vendor error messages.
- A partial homepage renders successful sections rather than failing globally.

---

## 11. Accessibility specification

### Keyboard

- A skip link targets main content.
- Header controls follow visual order.
- Menus use native buttons and links with predictable Escape behavior.
- Language selection returns focus to the corresponding destination heading.
- Focus is never trapped outside a modal.
- All interactive targets are at least 44 × 44 CSS px on touch layouts.

### Focus

- 2 px high-contrast focus ring with 2 px offset
- Never remove browser focus without an equivalent
- Focus treatment remains visible in light and dark themes
- Whole-card links must not create nested interactive conflicts

### Screen readers

- One page-level heading
- Sections use sequential headings
- Navigation regions are named
- Relative timestamps expose absolute date/time
- Images require contextual alternative text; decorative images use empty alt
- Ad regions are labeled
- Signal state is part of accessible text
- Only material breaking/live updates use polite live-region announcements

### Contrast and color

- WCAG 2.2 AA minimum
- Metadata remains at least 4.5:1 against its surface
- Signal, market movement, selected filters, and correction state never depend
  on color alone

### Motion and media

- Respect reduced motion
- No autoplay audio
- Animated Live indicator becomes static
- Video additions must support captions and transcript paths

---

## 12. Performance and Core Web Vitals

### Images

- Hero image is the only default high-priority editorial image.
- Use responsive source sizes and modern formats.
- Reserve width/height or aspect ratio.
- Lazy-load below-the-fold card images.
- Do not download desktop crops for mobile.
- Use editorial focal points so responsive crops preserve meaning.
- Decorative category imagery is not part of Phase 1.

### Rendering and loading

- Render shell, signal, hero, and initial Latest on the server.
- Stream lower sections in editorial order where useful.
- Use skeletons only for delayed sections, not already available server data.
- Avoid client-side layout decisions that can change geometry after hydration.

### Pagination

Use explicit pagination for Latest, category, and search destinations.

Do not use infinite scroll in Phase 1 because pagination:

- preserves browser history,
- exposes stable crawlable URLs,
- keeps the footer reachable,
- supports keyboard and assistive technology,
- limits memory and network use,
- gives readers a sense of place.

“Load more” may be evaluated later as progressive enhancement while preserving
page URLs.

### Performance budgets

- Initial homepage hero: one priority image
- No autoplay media
- No carousel library
- No layout shift from ads, images, or font swaps
- Web fonts use a fallback strategy with compatible metrics
- Nonessential weather/market data cannot block the shell or hero

---

## 13. SEO and content semantics

- One descriptive page-level heading
- Every homepage rail has a meaningful section heading and destination link
- Headlines are real links, not click handlers
- Category links remain crawlable
- Latest and category pagination exposes stable URLs
- Story cards do not duplicate the same headline in hidden markup
- Image captions and source attribution remain semantic text
- Language switcher points to equivalent translated stories when available
- Locale pages expose distinct canonical and alternate language relationships
- Opinion is labeled as a content type in text, not only visually

---

## 14. Future-proofing

### CMS

Homepage slots map to explicit editorial modules: hero, secondary pair, Latest,
section lead, section cards, Opinion, Editor’s Picks, Trending, and AdSlot. A CMS
can populate or reorder allowed modules without changing their visual contract.

### Live updates

The Signal Rail links to a story whose detail page can expand into a timestamped
update timeline. The homepage structure does not change.

### Citizen Reporting

Citizen reports use the same Story Card system with a visible “Citizen Report”
content label and verification status. They enter standard sections only after
editorial approval.

### AI summaries

An optional “Key points” disclosure can appear after a story summary, clearly
labeled as AI-assisted and linked to source material. AI output never replaces
the authored headline, standfirst, or provenance.

### Comments

Comments attach after the story body and related content. They do not affect the
homepage grid.

### Notifications

The reserved profile/control area can later contain a notification trigger. The
Signal state model provides consistent vocabulary for push urgency.

### Live video

Video uses a Featured Card or Hero media variant with an explicit duration and
Live label. It does not introduce an autoplay homepage takeover.

---

## 15. Acceptance criteria for implementation

The design is ready for implementation when the frontend can demonstrate:

- The shell, hero, and all sections at 320, 390, 768, 1024, 1280, and 1440 px
- Equal hierarchy and natural wrapping in English, Hindi, and Marathi
- Signal Rail states: absent, Breaking, Live, Verified, Corrected, Developing
- Every card variant with and without an image
- Light and dark themes meeting contrast requirements
- Keyboard navigation through the full header and language menu
- Reduced-motion behavior
- Reserved ad and image dimensions with no layout shift
- Partial-section error recovery
- Skeletons matching final geometry
- Pagination rather than infinite scroll
- No inaccessible nested links or icon-only essential actions

---

## 16. Final implementation recommendations

1. Build the global shell and Signal Rail first; they define the brand.
2. Validate typography with real English, Hindi, and Marathi headlines before
   fixing card proportions.
3. Implement card variants from one shared content model, while keeping their
   presentation explicit.
4. Use one source of design tokens across Tailwind and component styling.
5. Test the homepage with missing images, long Devanagari headlines, no active
   signal, and partially unavailable sections.
6. Reserve ad geometry from the first implementation pass.
7. Preserve semantic document order and use CSS Grid only for visual placement.
8. Treat Signal red and animation as governed editorial resources.
9. Run accessibility and Core Web Vitals checks at every responsive milestone.
10. Do not add personalization, infinite scroll, autoplay, or carousel behavior
    to Phase 1.

This specification is the single source of truth for the Signal Edition
homepage implementation.
