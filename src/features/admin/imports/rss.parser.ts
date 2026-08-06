import { XMLParser, XMLValidator } from "fast-xml-parser";

export type ParsedRssEntry = Readonly<{
  id: string | null;
  title: string | null;
  link: string | null;
  summary: string | null;
  content: string | null;
  publishedAt: string | null;
  author: string | null;
  categories: readonly string[];
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  language: string | null;
}>;

export type ParsedSyndicationFeed = Readonly<{
  format: "rss" | "atom";
  title: string | null;
  language: string | null;
  entries: readonly ParsedRssEntry[];
}>;

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  allowBooleanAttributes: true,
  attributeNamePrefix: "@_",
  cdataPropName: "#cdata",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: true,
  textNodeName: "#text",
  trimValues: true,
});

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  if (!isRecord(value)) return null;
  return text(value["#text"]) ?? text(value["#cdata"]);
}

function attribute(value: unknown, name: string): string | null {
  return isRecord(value) ? text(value[`@_${name}`]) : null;
}

type ImageCandidate = Readonly<{ url: string; width: number | null; height: number | null }>;

function positiveInteger(value: string | null): number | null {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function linkFrom(value: unknown): string | null {
  const links = asArray(value);
  const alternate = links.find((link) => {
    const relation = attribute(link, "rel");
    return !relation || relation === "alternate";
  });
  return attribute(alternate, "href") ?? text(alternate) ?? null;
}

function categoriesFrom(value: unknown): string[] {
  return asArray(value)
    .map((category) => attribute(category, "term") ?? text(category))
    .filter((category): category is string => Boolean(category));
}

function authorFrom(entry: XmlRecord): string | null {
  const atomAuthor = entry.author;
  if (isRecord(atomAuthor)) return text(atomAuthor.name) ?? text(atomAuthor);
  return text(entry["dc:creator"]) ?? text(atomAuthor);
}

function contentImage(value: string | null): string | null {
  return value?.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/iu)?.[1] ?? null;
}

function mediaImage(value: unknown): ImageCandidate | null {
  for (const item of asArray(value)) {
    const url = attribute(item, "url") ?? attribute(item, "href");
    const medium = attribute(item, "medium")?.toLocaleLowerCase("en");
    const type = attribute(item, "type")?.toLocaleLowerCase("en");
    if (medium && medium !== "image") continue;
    if (type && !type.startsWith("image/")) continue;
    if (url) return {
      url,
      width: positiveInteger(attribute(item, "width")),
      height: positiveInteger(attribute(item, "height")),
    };
  }
  return null;
}

function enclosureImage(value: unknown): ImageCandidate | null {
  for (const item of asArray(value)) {
    const url = attribute(item, "url");
    const type = attribute(item, "type");
    if (url && (!type || type.toLocaleLowerCase("en").startsWith("image/"))) {
      return {
        url,
        width: positiveInteger(attribute(item, "width")),
        height: positiveInteger(attribute(item, "height")),
      };
    }
  }
  return null;
}

function imageElementUrl(value: unknown): string | null {
  if (!isRecord(value)) return text(value);
  return (
    attribute(value, "url") ??
    attribute(value, "href") ??
    attribute(value, "src") ??
    text(value.url) ??
    text(value.href) ??
    text(value.src) ??
    text(value)
  );
}

function toEntry(value: unknown, language: string | null): ParsedRssEntry | null {
  if (!isRecord(value)) return null;
  const summary = text(value.description) ?? text(value.summary);
  const content = text(value["content:encoded"]) ?? text(value.content);
  const image =
    mediaImage(value["media:content"]) ??
    enclosureImage(value.enclosure) ??
    mediaImage(value["media:thumbnail"]);
  const fallbackImageUrl = imageElementUrl(value.image) ?? contentImage(content) ?? contentImage(summary);
  return {
    id: text(value.guid) ?? text(value.id),
    title: text(value.title),
    link: linkFrom(value.link),
    summary,
    content,
    publishedAt:
      text(value.pubDate) ??
      text(value.published) ??
      text(value.updated) ??
      text(value["dc:date"]),
    author: authorFrom(value),
    categories: categoriesFrom(value.category),
    imageUrl: image?.url ?? fallbackImageUrl,
    imageWidth: image?.width ?? null,
    imageHeight: image?.height ?? null,
    language,
  };
}

function rssFeed(input: XmlRecord): ParsedSyndicationFeed | null {
  const rss = input.rss;
  if (!isRecord(rss) || !isRecord(rss.channel)) return null;
  const channel = rss.channel;
  const language = text(channel.language) ?? attribute(channel, "xml:lang");
  return {
    format: "rss",
    title: text(channel.title),
    language,
    entries: asArray(channel.item)
      .map((entry) => toEntry(entry, language))
      .filter((entry): entry is ParsedRssEntry => entry !== null),
  };
}

function rdfFeed(input: XmlRecord): ParsedSyndicationFeed | null {
  const rdf = input["rdf:RDF"];
  if (!isRecord(rdf)) return null;
  const channel = isRecord(rdf.channel) ? rdf.channel : {};
  const language = text(channel.language) ?? text(channel["dc:language"]);
  return {
    format: "rss",
    title: text(channel.title),
    language,
    entries: asArray(rdf.item)
      .map((entry) => toEntry(entry, language))
      .filter((entry): entry is ParsedRssEntry => entry !== null),
  };
}

function atomFeed(input: XmlRecord): ParsedSyndicationFeed | null {
  const feed = input.feed;
  if (!isRecord(feed)) return null;
  const language = text(feed.language) ?? attribute(feed, "xml:lang");
  return {
    format: "atom",
    title: text(feed.title),
    language,
    entries: asArray(feed.entry)
      .map((entry) => toEntry(entry, language))
      .filter((entry): entry is ParsedRssEntry => entry !== null),
  };
}

export function parseSyndicationFeed(xml: string): ParsedSyndicationFeed {
  if (/<!DOCTYPE\b/iu.test(xml)) {
    throw new Error("The document is not a valid RSS or Atom feed.");
  }
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("The document is not a valid RSS or Atom feed.");
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new Error("The document is not a valid RSS or Atom feed.");
  }
  if (!isRecord(parsed)) {
    throw new Error("The document is not a valid RSS or Atom feed.");
  }

  const feed = rssFeed(parsed) ?? rdfFeed(parsed) ?? atomFeed(parsed);
  if (!feed) {
    throw new Error("The document is not a valid RSS or Atom feed.");
  }
  return feed;
}
