# Phase 1 seed data

The idempotent reference data is defined in
`supabase/migrations/20260730021000_phase_1_seed_data.sql`.

## Supported languages

| Code | Name | Native name |
| --- | --- | --- |
| `en` | English | English |
| `hi` | Hindi | हिन्दी |
| `mr` | Marathi | मराठी |

All three languages are enabled by the seed.

## Default categories

Each language receives the same 12 logical categories, joined by a stable slug:
National, World, Politics, Business, Technology, Sports, Entertainment, Health,
Education, Science, Crime, and Lifestyle. Display names are localized for
English, Hindi, and Marathi.

## Initial news sources

| Language | Source | Default category |
| --- | --- | --- |
| English | Hindustan Times India | National |
| English | The Indian Express India | National |
| Hindi | Amar Ujala Breaking News | National |
| Hindi | BBC News Hindi | National |
| Marathi | Maha Headline Maharashtra | National |
| Marathi | ABP Majha Maharashtra | National |

The source rows use RSS feeds, remain active, and resolve both their language
and localized default category through foreign keys. Feed usage remains subject
to each publisher's current syndication terms.

The normalized `sources.default_language_id` foreign key is populated by
resolving each seed row's `language_code`; a duplicate language-code column is
not stored on `sources`.

## Development admin profile

No placeholder admin profile is inserted. `profiles.id` has a mandatory foreign
key to `auth.users.id`, and this milestone must not create authentication users.
After a development user is created through Supabase Auth, trusted server-side
provisioning can create the matching profile and assign the admin role.
