# INBCN reusable design system

The reusable Signal Edition component library is organized into three layers:

- `src/components/ui` contains low-level shadcn-style primitives such as
  typography, buttons, cards, badges, chips, avatars, dropdowns, and skeletons.
- `src/components/common` contains editorial components such as story-card
  variants, metadata, language and theme controls, advertisements, states,
  breadcrumbs, sharing, pagination, and reading progress.
- `src/components/layout` contains structural components such as containers,
  grids, sections, the page shell, navigation, header, footer, utility bar, and
  Editorial Signal Rail.

## Usage

Prefer direct imports in production components so client-only controls do not
enter unrelated bundles:

```tsx
import { HeroCard } from "@/components/common/hero-card";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
```

The folder-level index files are provided for discoverability and prototypes.

Story variants share `StoryCardContent`, which keeps content semantics stable
while layouts change. `HeroCard`, `FeaturedCard`, `HorizontalCard`, and
`CompactCard` are presentation wrappers around the same accessible story
structure.

## Theming

Foundational colors use the existing shadcn CSS variables. Signal Edition adds:

- `signal` for Breaking, Live, and Corrected editorial states
- `verified` for independently verified states

Both have light and dark values. Signal color must always be paired with a text
label; color alone cannot communicate editorial state.

## Client boundaries

Most components are Server Component compatible. Only controls that require
browser state are Client Components:

- language dropdown
- theme toggle
- share button
- reading progress
- Radix avatar and dropdown primitives

No component performs data fetching, authentication, database access, or
business logic.
