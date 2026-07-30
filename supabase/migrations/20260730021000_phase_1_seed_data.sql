-- INBCN Phase 1 reference data
-- This migration is intentionally idempotent.

insert into public.languages (
  code,
  name,
  native_name,
  is_active
)
values
  ('en', 'English', 'English', true),
  ('hi', 'Hindi', 'हिन्दी', true),
  ('mr', 'Marathi', 'मराठी', true)
on conflict (code) do update
set
  name = excluded.name,
  native_name = excluded.native_name,
  is_active = excluded.is_active,
  updated_at = now();

with category_seed (
  language_code,
  slug,
  name,
  sort_order
) as (
  values
    ('en', 'national', 'National', 10),
    ('en', 'world', 'World', 20),
    ('en', 'politics', 'Politics', 30),
    ('en', 'business', 'Business', 40),
    ('en', 'technology', 'Technology', 50),
    ('en', 'sports', 'Sports', 60),
    ('en', 'entertainment', 'Entertainment', 70),
    ('en', 'health', 'Health', 80),
    ('en', 'education', 'Education', 90),
    ('en', 'science', 'Science', 100),
    ('en', 'crime', 'Crime', 110),
    ('en', 'lifestyle', 'Lifestyle', 120),

    ('hi', 'national', 'राष्ट्रीय', 10),
    ('hi', 'world', 'विश्व', 20),
    ('hi', 'politics', 'राजनीति', 30),
    ('hi', 'business', 'व्यापार', 40),
    ('hi', 'technology', 'प्रौद्योगिकी', 50),
    ('hi', 'sports', 'खेल', 60),
    ('hi', 'entertainment', 'मनोरंजन', 70),
    ('hi', 'health', 'स्वास्थ्य', 80),
    ('hi', 'education', 'शिक्षा', 90),
    ('hi', 'science', 'विज्ञान', 100),
    ('hi', 'crime', 'अपराध', 110),
    ('hi', 'lifestyle', 'जीवनशैली', 120),

    ('mr', 'national', 'राष्ट्रीय', 10),
    ('mr', 'world', 'जागतिक', 20),
    ('mr', 'politics', 'राजकारण', 30),
    ('mr', 'business', 'व्यवसाय', 40),
    ('mr', 'technology', 'तंत्रज्ञान', 50),
    ('mr', 'sports', 'क्रीडा', 60),
    ('mr', 'entertainment', 'मनोरंजन', 70),
    ('mr', 'health', 'आरोग्य', 80),
    ('mr', 'education', 'शिक्षण', 90),
    ('mr', 'science', 'विज्ञान', 100),
    ('mr', 'crime', 'गुन्हे', 110),
    ('mr', 'lifestyle', 'जीवनशैली', 120)
)
insert into public.categories (
  language_id,
  name,
  slug,
  sort_order,
  is_active
)
select
  languages.id,
  category_seed.name,
  category_seed.slug,
  category_seed.sort_order,
  true
from category_seed
join public.languages
  on languages.code = category_seed.language_code
on conflict (language_id, slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

with source_seed (
  name,
  slug,
  website_url,
  feed_url,
  language_code,
  default_category_slug
) as (
  values
    (
      'Hindustan Times India',
      'hindustan-times-india',
      'https://www.hindustantimes.com/',
      'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
      'en',
      'national'
    ),
    (
      'The Indian Express India',
      'indian-express-india',
      'https://indianexpress.com/',
      'https://indianexpress.com/section/india/feed/',
      'en',
      'national'
    ),
    (
      'Amar Ujala Breaking News',
      'amar-ujala-breaking-news',
      'https://www.amarujala.com/',
      'https://www.amarujala.com/rss/breaking-news.xml',
      'hi',
      'national'
    ),
    (
      'BBC News Hindi',
      'bbc-news-hindi',
      'https://www.bbc.com/hindi',
      'https://feeds.bbci.co.uk/hindi/rss.xml',
      'hi',
      'national'
    ),
    (
      'Maha Headline Maharashtra',
      'maha-headline-maharashtra',
      'https://www.mahaheadline.com/marathi/',
      'https://www.mahaheadline.com/marathi/rss/category/maharashtra',
      'mr',
      'national'
    ),
    (
      'ABP Majha Maharashtra',
      'abp-majha-maharashtra',
      'https://marathi.abplive.com/',
      'https://marathi.abplive.com/news/maharashtra/feed',
      'mr',
      'national'
    )
)
insert into public.sources (
  default_language_id,
  default_category_id,
  name,
  slug,
  source_type,
  website_url,
  feed_url,
  external_identifier,
  is_active
)
select
  languages.id,
  categories.id,
  source_seed.name,
  source_seed.slug,
  'rss'::public.source_type,
  source_seed.website_url,
  source_seed.feed_url,
  null,
  true
from source_seed
join public.languages
  on languages.code = source_seed.language_code
join public.categories
  on categories.language_id = languages.id
  and categories.slug = source_seed.default_category_slug
on conflict (slug) do update
set
  default_language_id = excluded.default_language_id,
  default_category_id = excluded.default_category_id,
  name = excluded.name,
  source_type = excluded.source_type,
  website_url = excluded.website_url,
  feed_url = excluded.feed_url,
  external_identifier = excluded.external_identifier,
  is_active = excluded.is_active,
  updated_at = now();
