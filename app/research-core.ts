import { classifyKnowledgeSourceAuthority, type RetrievedKnowledgeSource } from "./knowledge-research.ts";

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 0
    || parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] >= 224;
}

export function safeResearchUrl(raw: string, options: { allowLoopback?: boolean } = {}) {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const loopback = hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" || isPrivateIpv4(hostname);
    const privateIpv6 = hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
    if (!["https:", ...(options.allowLoopback ? ["http:"] : [])].includes(url.protocol)) return null;
    if ((loopback && !options.allowLoopback) || privateIpv6) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max = 16_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function decodeHtml(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token: string) => {
    const lower = token.toLowerCase();
    if (lower in named) return named[lower];
    const radix = lower.startsWith("#x") ? 16 : 10;
    const numeric = Number.parseInt(lower.replace(/^#x?/, ""), radix);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
  });
}

export function htmlToEvidenceText(html: string) {
  return decodeHtml(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16_000);
}

function source(input: {
  id: string;
  query: string;
  title: unknown;
  url: unknown;
  excerpt: unknown;
  publishedAt?: unknown;
  retrievedAt: string;
}): RetrievedKnowledgeSource | null {
  const url = cleanText(input.url, 1_200);
  if (!safeResearchUrl(url)) return null;
  const excerpt = cleanText(input.excerpt);
  if (excerpt.length < 30) return null;
  const title = cleanText(input.title, 240) || new URL(url).hostname;
  const authority = classifyKnowledgeSourceAuthority(url, title);
  return {
    id: input.id,
    query: input.query,
    title,
    url,
    excerpt,
    publishedAt: cleanText(input.publishedAt, 80),
    retrievedAt: input.retrievedAt,
    authorityTier: authority.tier,
    authorityReason: authority.reason,
  };
}

export function parseSearxngResults(payload: unknown, query: string, retrievedAt: string) {
  const results = payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)
    ? (payload as { results: Array<Record<string, unknown>> }).results
    : [];
  return results.flatMap((item, index) => {
    const normalized = source({
      id: `searx-${index + 1}`,
      query,
      title: item.title,
      url: item.url,
      excerpt: item.content ?? item.description,
      publishedAt: item.publishedDate ?? item.published_at,
      retrievedAt,
    });
    return normalized ? [normalized] : [];
  });
}

function firecrawlRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) return data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (data && typeof data === "object") {
    const web = (data as { web?: unknown }).web;
    if (Array.isArray(web)) return web.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  return [];
}

export function parseFirecrawlResults(payload: unknown, query: string, retrievedAt: string) {
  return firecrawlRows(payload).flatMap((item, index) => {
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {};
    const normalized = source({
      id: `firecrawl-${index + 1}`,
      query,
      title: item.title ?? metadata.title,
      url: item.url ?? metadata.sourceURL ?? metadata.url,
      excerpt: item.markdown ?? item.content ?? item.description ?? metadata.description,
      publishedAt: item.publishedDate ?? metadata.publishedDate ?? metadata.date,
      retrievedAt,
    });
    return normalized ? [normalized] : [];
  });
}

export function dedupeResearchSources(sources: RetrievedKnowledgeSource[], limit = 12) {
  const seen = new Set<string>();
  const rank = { official: 5, primary: 4, reputable_secondary: 3, community: 2, unknown: 1 } as const;
  return sources.filter((item) => {
    const normalized = item.url.replace(/\/$/, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).sort((left, right) => rank[right.authorityTier] - rank[left.authorityTier]).slice(0, limit).map((item, index) => ({ ...item, id: `source-${index + 1}` }));
}
